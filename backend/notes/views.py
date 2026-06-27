import io
import json
import logging
import re
import socket
from ipaddress import ip_address
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import uuid4

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import connection, transaction
from django.db.models import Count, Q
from PIL import Image
from rest_framework import status, viewsets
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

logger = logging.getLogger("notes")
from rest_framework.decorators import action
from rest_framework.generics import CreateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Note, Tag
from .pagination import NotePagination
from .recommendation import get_similar_notes
from .serializers import (
    MAX_CONTENT_CHARS,
    MAX_NOTES_PER_USER,
    MAX_TAG_NAME_LEN,
    MAX_TAGS_PER_NOTE,
    NoteSerializer,
    TagSerializer,
    UserRegistrationSerializer,
)
from .services.tag_service import get_or_create_tags_for_owner
from .services.vector_service import rebuild_vector_for_note, rebuild_vectors_for_owner

try:
    from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector

    POSTGRES_SEARCH_AVAILABLE = True
except ImportError:
    POSTGRES_SEARCH_AVAILABLE = False


class LinkPreviewThrottle(UserRateThrottle):
    scope = "link_preview"


def extract_html_meta(html: str, *names: str) -> str:
    """Return the first matching HTML meta tag content by property or name."""
    for name in names:
        patterns = (
            rf'<meta[^>]+property=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']+)["\']',
            rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']{re.escape(name)}["\']',
            rf'<meta[^>]+name=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']+)["\']',
            rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']{re.escape(name)}["\']',
        )
        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                return match.group(1).strip()
    return ""


def extract_html_title(html: str) -> str:
    """Return the HTML title content."""
    match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if not match:
        return ""
    return re.sub(r"\s+", " ", match.group(1)).strip()


def fetch_link_preview(url: str) -> dict[str, str]:
    """Fetch a minimal Open Graph preview for a public HTTP or HTTPS URL."""
    url, _pinned_ip = validate_public_fetch_url(url)
    parsed = urlparse(url)

    with open_public_url(
        url,
        headers={
            "User-Agent": "SmartNotebook/1.0 (+https://smartnotebook.local)",
            "Accept": "text/html,application/xhtml+xml",
        },
    ) as response:
        content_type = response.headers.get("Content-Type", "")
        if (
            "text/html" not in content_type
            and "application/xhtml+xml" not in content_type
        ):
            raise ValueError("Link preview is only available for HTML pages.")

        html = response.read(1024 * 1024).decode("utf-8", errors="ignore")

    return {
        "url": url,
        "title": extract_html_meta(html, "og:title", "twitter:title")
        or extract_html_title(html)
        or url,
        "description": extract_html_meta(
            html, "og:description", "description", "twitter:description"
        ),
        "image": extract_html_meta(html, "og:image", "twitter:image"),
        "site_name": extract_html_meta(html, "og:site_name") or parsed.netloc,
    }


def normalize_newlines(value: str) -> str:
    """Normalize CRLF and CR line endings to LF."""
    return value.replace("\r\n", "\n").replace("\r", "\n")


def decode_uploaded_text(uploaded_file) -> str:
    """Decode uploaded text using encodings commonly produced on Windows."""
    raw_content = uploaded_file.read()
    if raw_content.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw_content.decode("utf-16").strip()
    return raw_content.decode("utf-8-sig").strip()


def validate_public_fetch_url(url: str) -> tuple[str, str]:
    """Reject localhost and non-public targets. Returns (url, pinned_ip).

    Resolves the hostname once and validates all returned IPs.
    The caller must connect to the returned pinned_ip directly to prevent
    DNS rebinding attacks (where a hostname resolves to a public IP at
    validation time then switches to a private IP at connection time).
    """
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Enter a valid HTTP or HTTPS URL.")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Enter a valid HTTP or HTTPS URL.")

    normalized_host = hostname.strip().lower()
    if (
        normalized_host == "localhost"
        or normalized_host.endswith(".localhost")
        or normalized_host.endswith(".local")
    ):
        raise ValueError("Link preview is only available for public URLs.")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    try:
        addresses = {
            result[4][0]
            for result in socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        }
    except socket.gaierror as error:
        raise ValueError("Could not resolve the requested host.") from error

    if not addresses:
        raise ValueError("Could not resolve the requested host.")

    for resolved in addresses:
        if not ip_address(resolved).is_global:
            raise ValueError("Link preview is only available for public URLs.")

    # Pin one resolved IP so the connection always goes to the validated address
    pinned_ip = next(iter(addresses))
    return url, pinned_ip


class NoRedirectHandler(HTTPRedirectHandler):
    """Disable implicit redirects so each target can be revalidated."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def open_public_url(
    url: str, headers: dict[str, str], timeout: int = 5, max_redirects: int = 3
):
    """Open a public URL while pinning the resolved IP to prevent DNS rebinding."""
    opener = build_opener(NoRedirectHandler())
    current_url = url

    for _ in range(max_redirects + 1):
        validated_url, pinned_ip = validate_public_fetch_url(current_url)

        # Replace hostname with the pinned IP in the request URL so the TCP
        # connection goes to the address we already validated.
        parsed = urlparse(validated_url)
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        pinned_netloc = (
            f"[{pinned_ip}]:{port}" if ":" in pinned_ip else f"{pinned_ip}:{port}"
        )
        request_url = parsed._replace(netloc=pinned_netloc).geturl()

        request = Request(request_url, headers={**headers, "Host": parsed.hostname})

        try:
            return opener.open(request, timeout=timeout)
        except HTTPError as error:
            if error.code in {301, 302, 303, 307, 308}:
                location = error.headers.get("Location")
                error.close()
                if not location:
                    raise ValueError("Failed to follow redirect.") from error
                current_url = urljoin(validated_url, location)
                continue
            raise

    raise ValueError("Too many redirects while fetching link preview.")


def detect_image_format(header: bytes) -> tuple[str, tuple[str, ...], str] | None:
    """Return detected image type, allowed extensions, and canonical extension."""
    signatures = (
        (
            "png",
            (".png",),
            ".png",
            lambda value: value.startswith(b"\x89PNG\r\n\x1a\n"),
        ),
        (
            "jpeg",
            (".jpg", ".jpeg"),
            ".jpg",
            lambda value: value.startswith(b"\xff\xd8\xff"),
        ),
        (
            "gif",
            (".gif",),
            ".gif",
            lambda value: value.startswith((b"GIF87a", b"GIF89a")),
        ),
        (
            "webp",
            (".webp",),
            ".webp",
            lambda value: len(value) >= 12
            and value[:4] == b"RIFF"
            and value[8:12] == b"WEBP",
        ),
        ("bmp", (".bmp",), ".bmp", lambda value: value.startswith(b"BM")),
    )

    for image_type, allowed_extensions, canonical_extension, matches in signatures:
        if matches(header):
            return image_type, allowed_extensions, canonical_extension
    return None


def parse_exported_note_file(content: str, suffix: str) -> dict[str, object]:
    """Extract note metadata from SmartNotebook TXT and Markdown exports."""
    content = normalize_newlines(content)
    parsed = {
        "title": None,
        "content": content.strip(),
        "tags": [],
    }

    if suffix == ".md" and content.startswith("---"):
        front_matter_match = re.match(r"^---\n(.*?)\n---\n?(.*)$", content, re.DOTALL)
        if not front_matter_match:
            return parsed

        front_matter, body = front_matter_match.groups()
        title_match = re.search(r'^title:\s*"(.*)"$', front_matter, re.MULTILINE)
        if title_match:
            parsed["title"] = title_match.group(1).replace('\\"', '"').strip() or None

        tag_matches = re.findall(r'^\s*-\s*"(.*)"\s*$', front_matter, re.MULTILINE)
        parsed["tags"] = [
            tag.replace('\\"', '"').strip() for tag in tag_matches if tag.strip()
        ]

        lines = body.strip().splitlines()
        content_start = 0

        if lines and parsed["title"] and lines[0].strip() == f"# {parsed['title']}":
            content_start = 1
            while content_start < len(lines) and not lines[content_start].strip():
                content_start += 1

            for prefix in ("- Created:", "- Updated:", "- Tags:"):
                if content_start < len(lines) and lines[content_start].startswith(
                    prefix
                ):
                    content_start += 1

            while content_start < len(lines) and not lines[content_start].strip():
                content_start += 1

        parsed["content"] = "\n".join(lines[content_start:]).strip() or content.strip()
        return parsed

    if suffix == ".txt":
        lines = content.splitlines()
        separator_index = next(
            (index for index, line in enumerate(lines) if line.strip() == "---"),
            None,
        )
        if separator_index is None:
            return parsed

        headers = lines[:separator_index]
        body = "\n".join(lines[separator_index + 1 :]).strip()

        for header in headers:
            if header.startswith("Title: "):
                parsed["title"] = header.removeprefix("Title: ").strip() or None
            elif header.startswith("Tags: "):
                tag_line = header.removeprefix("Tags: ").strip()
                if tag_line and tag_line != "-":
                    parsed["tags"] = [
                        tag.strip() for tag in tag_line.split(",") if tag.strip()
                    ]

        parsed["content"] = body or content.strip()

    return parsed


def can_use_postgres_search() -> bool:
    """Return whether PostgreSQL full-text search is available for this connection."""
    return POSTGRES_SEARCH_AVAILABLE and connection.vendor == "postgresql"


def build_postgres_search_queryset(user, query: str):
    """Build the ranked PostgreSQL full-text search queryset."""
    search_vector = SearchVector("title", "content")
    search_query = SearchQuery(query)

    return (
        Note.objects.filter(owner=user)
        .annotate(rank=SearchRank(search_vector, search_query))
        .filter(rank__gte=0.1)
        .order_by("-rank")
    )


def filter_notes_by_tag(queryset, user, tag_name: str | None):
    """Apply optional exact tag filtering inside one user's note scope."""
    normalized_tag_name = (tag_name or "").strip()
    if not normalized_tag_name:
        return queryset

    return queryset.filter(tags__owner=user, tags__name=normalized_tag_name).distinct()


# =========================
# ===== DRF API ===========
# =========================


class NoteViewSet(viewsets.ModelViewSet):
    serializer_class = NoteSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = NotePagination

    def get_queryset(self):
        queryset = Note.objects.filter(owner=self.request.user).prefetch_related("tags")
        return filter_notes_by_tag(
            queryset, self.request.user, self.request.query_params.get("tag")
        )

    def perform_create(self, serializer):
        note = serializer.save(owner=self.request.user)
        rebuild_vector_for_note(note)

    def perform_update(self, serializer):
        note = serializer.save()
        rebuild_vector_for_note(note)

    def perform_destroy(self, instance):
        owner = instance.owner
        instance.delete()
        Tag.objects.filter(owner=owner, notes__isnull=True).delete()
        rebuild_vectors_for_owner(owner)

    @action(detail=False, methods=["get"])
    def search(self, request):
        query = (request.query_params.get("q") or "").strip()

        if not query:
            return Response([])

        if can_use_postgres_search():
            queryset = build_postgres_search_queryset(
                request.user, query
            ).prefetch_related("tags")
        else:
            queryset = (
                Note.objects.filter(owner=request.user)
                .filter(Q(title__icontains=query) | Q(content__icontains=query))
                .prefetch_related("tags")
                .order_by("-updated_at")
            )

        queryset = filter_notes_by_tag(
            queryset, request.user, request.query_params.get("tag")
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def similar(self, request, pk=None):
        note = self.get_object()
        try:
            top_n = int(request.query_params.get("top_n", 3))
        except (TypeError, ValueError):
            top_n = 3
        top_n = min(max(top_n, 1), 10)

        similar_notes = get_similar_notes(note, request.user, top_n=top_n)

        serializer = self.get_serializer(similar_notes, many=True)
        return Response(serializer.data)

    @action(
        detail=False,
        methods=["get"],
        url_path="link-preview",
        throttle_classes=[LinkPreviewThrottle],
    )
    def link_preview(self, request):
        url = (request.query_params.get("url") or "").strip()
        if not url:
            return Response(
                {"error": "URL is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            preview = fetch_link_preview(url)
        except ValueError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        except (HTTPError, URLError):
            return Response(
                {"error": "Failed to fetch link preview."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception:
            return Response(
                {"error": "Failed to fetch link preview."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(preview)

    @action(detail=False, methods=["get"], url_path="backup")
    def backup(self, request):
        notes = self.get_queryset()
        payload = {
            "version": 1,
            "notes": [
                {
                    "title": note.title,
                    "content": note.content,
                    "tags": list(note.tags.values_list("name", flat=True)),
                    "created_at": note.created_at.isoformat(),
                    "updated_at": note.updated_at.isoformat(),
                }
                for note in notes
            ],
        }
        return Response(payload)

    @action(detail=False, methods=["post"], url_path="restore-backup")
    def restore_backup(self, request):
        uploaded_file = request.FILES.get("file")

        if not uploaded_file:
            return Response(
                {"error": "No backup file provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if uploaded_file.size > settings.BACKUP_RESTORE_MAX_BYTES:
            return Response(
                {"error": "Backup file is too large."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payload = json.loads(decode_uploaded_text(uploaded_file))
        except UnicodeDecodeError:
            return Response(
                {"error": "Backup file must be UTF-8 or UTF-16 encoded JSON."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except json.JSONDecodeError:
            return Response(
                {"error": "Backup file is not valid JSON."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        notes_data = payload.get("notes")
        if not isinstance(notes_data, list):
            return Response(
                {"error": "Backup file must contain a notes array."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        notes_to_restore: list[dict[str, object]] = []
        all_tag_names: list[object] = []

        current_count = Note.objects.filter(owner=request.user).count()
        available_slots = MAX_NOTES_PER_USER - current_count
        if available_slots <= 0:
            return Response(
                {"error": f"Note limit reached ({MAX_NOTES_PER_USER})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        total_in_backup = 0
        for item in notes_data:
            if not isinstance(item, dict):
                continue
            total_in_backup += 1
            title = str(item.get("title") or "").strip()[:255] or "Restored note"
            note_content = str(item.get("content") or "")[:MAX_CONTENT_CHARS]
            raw_tags = item.get("tags") or []
            tag_names = [
                str(t).strip().lower()[:MAX_TAG_NAME_LEN]
                for t in (raw_tags if isinstance(raw_tags, list) else [])
                if str(t).strip()
            ][:MAX_TAGS_PER_NOTE]
            notes_to_restore.append(
                {"title": title, "content": note_content, "tag_names": tag_names}
            )
            all_tag_names.extend(tag_names)

        skipped = max(0, total_in_backup - available_slots)
        notes_to_restore = notes_to_restore[:available_slots]

        tags_by_name = get_or_create_tags_for_owner(request.user, all_tag_names)
        restored_notes: list[Note] = []

        with transaction.atomic():
            for item in notes_to_restore:
                note = Note.objects.create(
                    owner=request.user,
                    title=str(item["title"]),
                    content=str(item["content"]),
                )
                tags = [tags_by_name[n] for n in item["tag_names"] if n in tags_by_name]
                if tags:
                    note.tags.set(tags)
                restored_notes.append(note)

        if restored_notes:
            rebuild_vectors_for_owner(request.user)

        resp: dict = {"restored": len(restored_notes)}
        if skipped:
            resp["warning"] = (
                f"{skipped} note(s) skipped — {MAX_NOTES_PER_USER}-note limit reached."
            )
            logger.info(
                "Restore truncated user=%s skipped=%d total=%d",
                request.user.id,
                skipped,
                total_in_backup,
            )
        return Response(resp, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="import")
    def import_note(self, request):
        uploaded_file = request.FILES.get("file")

        if not uploaded_file:
            return Response(
                {"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST
            )

        if uploaded_file.size > settings.NOTE_IMPORT_MAX_BYTES:
            return Response(
                {"error": "Imported file is too large."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        suffix = Path(uploaded_file.name).suffix.lower()
        supported_suffixes = {".txt", ".md", ".pdf"}
        if suffix not in supported_suffixes:
            return Response(
                {"error": "Unsupported file type. Use .txt, .md, or .pdf."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            if suffix == ".pdf":
                try:
                    from pypdf import PdfReader
                except ImportError:
                    return Response(
                        {
                            "error": "PDF import requires the pypdf package to be installed."
                        },
                        status=status.HTTP_503_SERVICE_UNAVAILABLE,
                    )

                reader = PdfReader(uploaded_file)
                content = "\n\n".join(
                    page_text.strip()
                    for page in reader.pages
                    if (page_text := (page.extract_text() or ""))
                ).strip()
            else:
                content = decode_uploaded_text(uploaded_file)
        except UnicodeDecodeError:
            return Response(
                {"error": "Text files must be UTF-8 or UTF-16 encoded."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            return Response(
                {"error": "Failed to read the uploaded file."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not content:
            return Response(
                {"error": "Imported file does not contain readable text."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if Note.objects.filter(owner=request.user).count() >= MAX_NOTES_PER_USER:
            return Response(
                {"error": f"Note limit reached ({MAX_NOTES_PER_USER})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        parsed_note = parse_exported_note_file(content, suffix)
        note_title = (
            request.data.get("title")
            or parsed_note["title"]
            or Path(uploaded_file.name).stem.replace("_", " ").strip()
        )
        note = Note.objects.create(
            owner=request.user,
            title=note_title[:255] or "Imported note",
            content=str(parsed_note["content"]),
            is_markdown=suffix == ".md",
        )
        if parsed_note["tags"]:
            tags = list(
                get_or_create_tags_for_owner(request.user, parsed_note["tags"]).values()
            )
            note.tags.set(tags)

        rebuild_vector_for_note(note)

        serializer = self.get_serializer(note)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="upload-image")
    def upload_image(self, request):
        uploaded_file = request.FILES.get("file")

        if not uploaded_file:
            return Response(
                {"error": "No image file provided."}, status=status.HTTP_400_BAD_REQUEST
            )

        if not getattr(uploaded_file, "content_type", "").startswith("image/"):
            return Response(
                {"error": "Only image uploads are supported."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if uploaded_file.size > settings.IMAGE_UPLOAD_MAX_BYTES:
            return Response(
                {"error": "Image file is too large."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        header = uploaded_file.read(64)
        uploaded_file.seek(0)
        detected = detect_image_format(header)
        if not detected:
            return Response(
                {"error": "Unsupported or invalid image file."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _image_type, allowed_extensions, canonical_extension = detected
        suffix = Path(uploaded_file.name or "").suffix.lower()
        if suffix and suffix not in allowed_extensions:
            return Response(
                {"error": "Image file extension does not match its content."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        suffix = suffix or canonical_extension

        image_data = uploaded_file.read()
        try:
            with Image.open(io.BytesIO(image_data)) as img:
                img.load()
                cleaned = io.BytesIO()
                if _image_type == "jpeg" and img.mode not in ("RGB", "L"):
                    img = img.convert("RGB")
                img.save(
                    cleaned,
                    format={
                        "jpeg": "JPEG",
                        "png": "PNG",
                        "gif": "GIF",
                        "webp": "WEBP",
                        "bmp": "BMP",
                    }[_image_type],
                    exif=b"",
                )
                processed_file = ContentFile(cleaned.getvalue())
        except Exception:
            return Response(
                {"error": "Image processing failed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        filename = f"note-images/{request.user.id}/{uuid4().hex}{suffix}"
        saved_path = default_storage.save(filename, processed_file)
        media_url = (
            settings.MEDIA_URL
            if settings.MEDIA_URL.endswith("/")
            else f"{settings.MEDIA_URL}/"
        )
        normalized_saved_path = str(saved_path).replace("\\", "/").lstrip("/")
        image_url = urljoin(media_url, normalized_saved_path)

        return Response({"url": image_url}, status=status.HTTP_201_CREATED)


class TagViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Tag.objects.filter(owner=self.request.user, notes__owner=self.request.user)
            .annotate(note_count=Count("notes"))
            .distinct()
            .order_by("name")
        )


class HealthCheckView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        db_ok = True
        try:
            connection.ensure_connection()
        except Exception:
            db_ok = False
        payload = {"status": "ok" if db_ok else "degraded", "db": db_ok}
        return Response(
            payload,
            status=status.HTTP_200_OK if db_ok else status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            from rest_framework_simplejwt.tokens import RefreshToken

            token = request.data.get("refresh")
            if not token:
                return Response(
                    {"error": "refresh token required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            RefreshToken(token).blacklist()
            return Response({"detail": "Logged out."}, status=status.HTTP_200_OK)
        except Exception:
            return Response(
                {"error": "Invalid token."}, status=status.HTTP_400_BAD_REQUEST
            )


class ProtectedMediaView(APIView):
    """Serve media only to the owning user. In production use nginx X-Accel-Redirect."""

    permission_classes = [IsAuthenticated]

    def get(self, request, path):
        import os
        from django.http import FileResponse, Http404

        parts = path.strip("/").split("/")
        try:
            if int(parts[0]) != request.user.id:
                raise Http404
        except (ValueError, IndexError):
            raise Http404

        # Нормализуем путь и проверяем, что он остаётся внутри MEDIA_ROOT/<user_id>/
        full_path = os.path.normpath(os.path.join(settings.MEDIA_ROOT, path))
        expected_prefix = os.path.normpath(
            os.path.join(settings.MEDIA_ROOT, str(request.user.id))
        )
        if not full_path.startswith(expected_prefix + os.sep) and full_path != expected_prefix:
            raise Http404

        if not os.path.isfile(full_path):
            raise Http404
        if os.environ.get("MEDIA_USE_NGINX"):
            from django.http import HttpResponse

            r = HttpResponse()
            r["X-Accel-Redirect"] = f"/protected-media/{path}"
            r["Content-Type"] = ""
            return r
        return FileResponse(open(full_path, "rb"))


class RegisterView(CreateAPIView):
    """Public endpoint for creating a new user account."""

    serializer_class = UserRegistrationSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Registration failed. Please check your input."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        self.perform_create(serializer)
        return Response({"detail": "Account created."}, status=status.HTTP_201_CREATED)
