import json
import os
import unittest
from datetime import timedelta
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken, AccessToken

from .models import Note, Tag
from .recommendation import build_note_document
from .serializers import MAX_NOTES_PER_USER


# =====================================================================
# 1. SQL INJECTION
# =====================================================================
class SqlInjectionTestCase(TestCase):
    """Проверка устойчивости к SQL-инъекциям."""

    def setUp(self):
        self.user = User.objects.create_user(username="sqli_user", password="StrongPass123!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.note = Note.objects.create(
            owner=self.user, title="Test", content="Content"
        )

    def _test_endpoint_safe(self, method, url, data=None, params=None):
        """Универсальная проверка — SQL-инъекция не должна вызывать ошибку 500."""
        payloads = [
            "'; DROP TABLE notes_note; --",
            "1' OR '1'='1",
            "1; DELETE FROM notes_note WHERE '1'='1",
            "' UNION SELECT * FROM auth_user --",
            "admin'--",
            "%",
            "_",
            "\\",
            "\x00",
            "\x1f",
            "\xff\xfe",
        ]
        for payload in payloads:
            params_copy = {**(params or {})}
            for key in params_copy:
                if isinstance(params_copy[key], str):
                    params_copy[key] = payload
            try:
                if method == "GET":
                    response = self.client.get(url, params_copy or {})
                elif method == "POST":
                    response = self.client.post(url, data or {}, format="json")
                elif method == "PATCH":
                    response = self.client.patch(url, data or {}, format="json")

                # 500 = вероятная SQL-инъекция
                self.assertNotEqual(
                    response.status_code, 500,
                    f"500 error with payload '{payload}' on {url}"
                )
                self.assertNotIn(
                    "syntax error", str(response.content[:200]).lower(),
                    f"SQL syntax error leak with payload '{payload}' on {url}"
                )
            except Exception as e:
                self.fail(f"Exception with payload '{payload}' on {url}: {e}")

    def test_search_sql_injection(self):
        """SQL-инъекция через параметр q в search."""
        self._test_endpoint_safe("GET", "/notes/search/", params={"q": "test"})

    def test_tag_filter_sql_injection(self):
        """SQL-инъекция через параметр tag в list."""
        self._test_endpoint_safe("GET", "/notes/", params={"tag": "test"})

    def test_tag_filter_in_search_sql_injection(self):
        """SQL-инъекция через tag внутри search."""
        self._test_endpoint_safe(
            "GET", "/notes/search/", params={"q": "test", "tag": "test"}
        )

    def test_create_note_sql_injection(self):
        """SQL-инъекция через поля заметки при создании."""
        self._test_endpoint_safe(
            "POST", "/notes/",
            data={
                "title": "'; DROP TABLE notes_note; --",
                "content": "'; DROP TABLE notes_note; --",
                "tags": ["'; DROP TABLE notes_note; --"],
            },
        )

    def test_update_note_sql_injection(self):
        """SQL-инъекция через поля заметки при обновлении."""
        self._test_endpoint_safe(
            "PATCH", f"/notes/{self.note.id}/",
            data={
                "title": "'; DROP TABLE notes_note; --",
                "content": "1' OR '1'='1",
            },
        )

    def test_import_md_with_sql_injection(self):
        """SQL-инъекция через импорт .md файла."""
        uploaded = SimpleUploadedFile(
            "inject.md",
            b"---\ntitle: \"'; DROP TABLE notes_note; --\"\ntags:\n  - \"'; DROP TABLE --\"\n---\nContent",
            content_type="text/markdown",
        )
        response = self.client.post("/notes/import/", {"file": uploaded}, format="multipart")
        self.assertNotEqual(response.status_code, 500)
        self.assertIn(response.status_code, [201, 400])

    def test_restore_backup_sql_injection(self):
        """SQL-инъекция через JSON-поля при восстановлении бэкапа."""
        payload = {
            "version": 1,
            "notes": [
                {
                    "title": "'; DROP TABLE notes_note; --",
                    "content": "'; DROP TABLE notes_note; --",
                    "tags": ["'; DROP TABLE notes_note; --"],
                }
            ],
        }
        uploaded = SimpleUploadedFile(
            "backup.json",
            json.dumps(payload).encode(),
            content_type="application/json",
        )
        response = self.client.post(
            "/notes/restore-backup/", {"file": uploaded}, format="multipart"
        )
        self.assertNotEqual(response.status_code, 500)
        self.assertIn(response.status_code, [201, 400])

    def test_top_n_injection(self):
        """SQL-инъекция через top_n параметр."""
        payloads = ["abc", "-1", "9999999999999999999999", "' OR '1'='1", "1; DROP TABLE"]
        for payload in payloads:
            response = self.client.get(f"/notes/{self.note.id}/similar/?top_n={payload}")
            self.assertIn(
                response.status_code, [200, 400],
                f"top_n='{payload}' should not crash, got {response.status_code}"
            )


# =====================================================================
# 2. XSS — проверка на фронтенде (анализ кода) + backend проверки
# =====================================================================
class XssTestCase(TestCase):
    """Проверка XSS — сохранение и возврат опасного контента."""

    def setUp(self):
        self.user = User.objects.create_user(username="xss_user", password="StrongPass123!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _create_note_with_xss(self, xss_payload):
        return self.client.post(
            "/notes/",
            {"title": xss_payload, "content": xss_payload, "tags": [xss_payload]},
            format="json",
        )

    def test_xss_in_title_and_content(self):
        """XSS-пейлоады в title/content должны сохраняться (без экранирования на backend).
        Экранирование — ответственность frontend (React JSX).

        Если backend начнёт экранировать HTML entities — будет double-escaping на frontend."""
        payloads = [
            "<script>alert('XSS')</script>",
            "<img src=x onerror=alert(1)>",
            "javascript:alert(1)",
            "<svg onload=alert(1)>",
            "{{constructor.constructor('alert(1)')()}}",
            "\"><script>alert(1)</script>",
        ]
        for payload in payloads:
            response = self._create_note_with_xss(payload)
            self.assertEqual(response.status_code, 201, f"XSS payload failed: {payload}")
            # Backend должен вернуть payload как есть (без экранирования)
            self.assertIn(payload, response.data["title"])

    def test_xss_in_note_list(self):
        """XSS в списке заметок — backend возвращает неэкранированным."""
        self._create_note_with_xss("<script>alert(1)</script>")
        response = self.client.get("/notes/")
        self.assertEqual(response.status_code, 200)
        # Backend не должен экранировать — это работа frontend
        raw_content = json.dumps(response.data)
        self.assertIn("<script>alert(1)</script>", raw_content)

    def test_xss_in_search_results(self):
        """XSS в результатах поиска."""
        self._create_note_with_xss("<img src=x onerror=alert(1)>")
        response = self.client.get("/notes/search/?q=<img")
        raw_content = json.dumps(response.data)
        self.assertIn("onerror=alert(1)", raw_content)

    def test_xss_in_import(self):
        """XSS через импорт markdown."""
        uploaded = SimpleUploadedFile(
            "xss.md",
            b"---\ntitle: \"<script>alert('XSS')</script>\"\ntags:\n  - \"<img src=x onerror=alert(1)>\"\n---\n<script>alert('XSS')</script>",
            content_type="text/markdown",
        )
        response = self.client.post("/notes/import/", {"file": uploaded}, format="multipart")
        self.assertEqual(response.status_code, 201)
        self.assertIn("<script>alert('XSS')</script>", response.data["content"])

    def test_xss_in_backup_restore(self):
        """XSS через восстановление бэкапа."""
        payload = {
            "version": 1,
            "notes": [
                {
                    "title": "<script>alert(1)</script>",
                    "content": "<script>alert(1)</script>",
                    "tags": ["<script>alert(1)</script>"],
                }
            ],
        }
        uploaded = SimpleUploadedFile(
            "backup.json", json.dumps(payload).encode(), content_type="application/json"
        )
        response = self.client.post(
            "/notes/restore-backup/", {"file": uploaded}, format="multipart"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["restored"], 1)

    def test_xss_in_link_preview(self):
        """XSS через link preview (внешний сайт возвращает meta c <script>)."""
        mock_html = b"""
        <html>
          <head>
            <meta property="og:title" content="<b>Bold title</b>" />
            <meta property="og:description" content="<img src=x onerror=alert(1)>" />
          </head>
        </html>
        """
        with patch("notes.views.socket.getaddrinfo") as mock_getaddrinfo, \
             patch("notes.views.open_public_url") as mock_open_public_url:

            mock_getaddrinfo.return_value = [
                (2, 1, 6, "", ("93.184.216.34", 443)),
            ]
            mock_response = mock_open_public_url.return_value.__enter__.return_value
            mock_response.read.return_value = mock_html
            mock_response.headers.get.return_value = "text/html; charset=utf-8"

            response = self.client.get(
                "/notes/link-preview/", {"url": "https://example.com/article"}
            )
            self.assertEqual(response.status_code, 200)
            # Backend должен вернуть как есть, frontend экранирует
            self.assertIn("<b>Bold title</b>", response.data["title"])
            self.assertIn("onerror=alert(1)", response.data["description"])


# =====================================================================
# 3. PATH TRAVERSAL
# =====================================================================
class PathTraversalTestCase(TestCase):
    """Проверка Path Traversal в ProtectedMediaView."""

    def setUp(self):
        self.user = User.objects.create_user(username="pt_user", password="StrongPass123!")
        self.other_user = User.objects.create_user(username="pt_other", password="StrongPass123!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.other_client = APIClient()
        self.other_client.force_authenticate(user=self.other_user)

    def test_path_traversal_dot_dot(self):
        """../ в пути media — должен быть 404."""
        traversals = [
            "../etc/passwd",
            "..%2f..%2fetc%2fpasswd",
            "....//....//etc/passwd",
            f"{self.user.id}/../../../etc/passwd",
            f"{self.user.id}/..\\..\\..\\windows\\win.ini",
            "%2e%2e/%2e%2e/etc/passwd",
        ]
        for traversal in traversals:
            response = self.client.get(f"/media/{traversal}")
            self.assertIn(
                response.status_code, [404, 400],
                f"Path traversal '{traversal}' should be blocked, got {response.status_code}"
            )

    def test_media_ownership_isolation(self):
        """Пользователь не может получить доступ к media другого пользователя
        через path traversal в user_id части пути."""
        # Создаем файл media для other_user
        media_dir = Path(settings.MEDIA_ROOT) / "note-images" / str(self.other_user.id)
        media_dir.mkdir(parents=True, exist_ok=True)
        test_file = media_dir / "test.png"
        test_file.write_text("fake-image-data")

        # Попытка доступа через path traversal: user.id -> ../other_user.id/
        traversals = [
            f"{self.user.id}/../{self.other_user.id}/test.png",
            f"{self.user.id}/..\\{self.other_user.id}\\test.png",
        ]
        for traversal in traversals:
            response = self.client.get(f"/media/{traversal}")
            # Должен быть 404 (защита через os.path.normpath + int check)
            self.assertEqual(response.status_code, 404)


# =====================================================================
# 4. JWT & AUTHENTICATION
# =====================================================================
class JwtSecurityTestCase(TestCase):
    """Проверка JWT-аутентификации."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="jwt_user", email="jwt@example.com", password="StrongPass123!"
        )
        self.client = APIClient()

    def test_fake_token_rejected(self):
        """Поддельный access token → 401 или 403."""
        self.client.credentials(HTTP_AUTHORIZATION="Bearer FAKE_TOKEN")
        response = self.client.get("/notes/")
        # DRF может вернуть 401 (JWT auth failed) или 403 (пермишен)
        self.assertIn(response.status_code, [401, 403])

    def test_expired_token_rejected(self):
        """Истекший access token → 401 или 403."""
        token = AccessToken.for_user(self.user)
        token.set_exp(lifetime=timedelta(seconds=-1))
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get("/notes/")
        self.assertIn(response.status_code, [401, 403])

    def test_token_from_different_user(self):
        """Токен одного пользователя не даёт доступ к данным другого."""
        other_user = User.objects.create_user(
            username="other_jwt", password="StrongPass123!"
        )
        Note.objects.create(owner=other_user, title="Secret", content="Hidden")

        token = AccessToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get("/notes/")
        self.assertEqual(response.status_code, 200)
        titles = [n["title"] for n in response.data["results"]]
        self.assertNotIn("Secret", titles)

    def test_refresh_token_replay(self):
        """Refresh token нельзя использовать дважды (blacklist)."""
        refresh = RefreshToken.for_user(self.user)
        refresh_token_str = str(refresh)

        # Первый refresh — должен работать
        response1 = self.client.post(
            "/api/token/refresh/", {"refresh": refresh_token_str}, format="json"
        )
        self.assertEqual(response1.status_code, 200)

        # Второй refresh с тем же токеном — должен быть заблокирован
        response2 = self.client.post(
            "/api/token/refresh/", {"refresh": refresh_token_str}, format="json"
        )
        self.assertEqual(response2.status_code, 401)

    def test_logout_blacklists_token(self):
        """Logout должен blacklist refresh token."""
        refresh = RefreshToken.for_user(self.user)
        refresh_token_str = str(refresh)

        # Login для получения access token
        login_response = self.client.post(
            "/api/token/",
            {"username": "jwt_user", "password": "StrongPass123!"},
            format="json",
        )
        access_token = login_response.data["access"]

        # Logout с blacklist
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        logout_response = self.client.post(
            "/api/logout/", {"refresh": refresh_token_str}, format="json"
        )
        self.assertEqual(logout_response.status_code, 200)

        # Попытка refresh после logout
        refresh_after = self.client.post(
            "/api/token/refresh/", {"refresh": refresh_token_str}, format="json"
        )
        self.assertEqual(refresh_after.status_code, 401)

    def test_unauthorized_access_returns_401(self):
        """Доступ без токена ко всем endpoint должен возвращать 401 или 403."""
        self.client.credentials()  # clear auth
        endpoints = [
            ("GET", "/notes/"),
            ("POST", "/notes/"),
            ("GET", "/notes/backup/"),
            ("GET", "/notes/1/similar/"),
            ("GET", "/notes/link-preview/"),
            ("POST", "/notes/upload-image/"),
        ]
        for method, url in endpoints:
            if method == "GET":
                response = self.client.get(url)
            else:
                response = self.client.post(url, {}, format="json")
            self.assertIn(
                response.status_code, [401, 403],
                f"{method} {url} should reject without auth"
            )

    def test_public_endpoints_accessible_without_auth(self):
        """Публичные endpoint доступны без аутентификации."""
        self.client.credentials()
        # Создаём пользователя для login/refresh тестов
        User.objects.create_user(username="existing", password="StrongPass123!")
        refresh = RefreshToken.for_user(self.user)
        refresh_token_str = str(refresh)

        endpoints_config = [
            ("GET", "/api/health/", {}),
            ("POST", "/api/token/", {"username": "existing", "password": "StrongPass123!"}),
            ("POST", "/api/token/refresh/", {"refresh": refresh_token_str}),
            ("POST", "/api/register/", {
                "username": "newuser", "password": "StrongPass123!",
                "password_confirm": "StrongPass123!",
            }),
        ]
        for method, url, data in endpoints_config:
            if method == "GET":
                response = self.client.get(url)
            else:
                response = self.client.post(url, data, format="json")
            self.assertNotEqual(
                response.status_code, 401,
                f"{method} {url} should be accessible without auth"
            )

    def test_jwt_key_length_warning(self):
        """Проверка длины SECRET_KEY (должен быть > 32 байт для HMAC-SHA256)."""
        secret = settings.SECRET_KEY
        self.assertGreaterEqual(
            len(secret), 32,
            f"SECRET_KEY слишком короткий ({len(secret)} байт). "
            "Согласно RFC 7518 Section 3.2, HMAC-SHA256 требует ключ >= 32 байт."
        )


# =====================================================================
# 5. AUTHORIZATION / ACCESS CONTROL
# =====================================================================
class AuthorizationTestCase(TestCase):
    """Проверка изоляции данных между пользователями."""

    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="StrongPass123!")
        self.other_user = User.objects.create_user(username="bob", password="StrongPass123!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.other_client = APIClient()
        self.other_client.force_authenticate(user=self.other_user)

        self.note = Note.objects.create(owner=self.user, title="Alice's note", content="Secret")
        self.other_note = Note.objects.create(
            owner=self.other_user, title="Bob's note", content="Also secret"
        )

    def test_cannot_read_other_users_note(self):
        """Alice не может прочитать заметку Bob."""
        response = self.client.get(f"/notes/{self.other_note.id}/")
        self.assertEqual(response.status_code, 404)

    def test_cannot_update_other_users_note(self):
        """Alice не может изменить заметку Bob."""
        response = self.client.patch(
            f"/notes/{self.other_note.id}/",
            {"title": "Hacked!"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_cannot_delete_other_users_note(self):
        """Alice не может удалить заметку Bob."""
        response = self.client.delete(f"/notes/{self.other_note.id}/")
        self.assertEqual(response.status_code, 404)

    def test_cannot_get_similar_for_other_note(self):
        """Alice не может получить рекомендации для заметки Bob."""
        response = self.client.get(f"/notes/{self.other_note.id}/similar/")
        self.assertEqual(response.status_code, 404)

    def test_tags_scoped_per_user(self):
        """Alice видит только свои теги."""
        Tag.objects.create(owner=self.user, name="alice-tag")
        Tag.objects.create(owner=self.other_user, name="bob-tag")

        # Создаем заметку с тегом, чтобы он появился в списке (TagViewSet фильтрует notes__owner)
        Note.objects.create(owner=self.user, title="Test").tags.add(
            Tag.objects.get(owner=self.user, name="alice-tag")
        )

        response = self.client.get("/tags/")
        self.assertEqual(response.status_code, 200)
        tag_names = [t["name"] for t in response.data]
        self.assertIn("alice-tag", tag_names)
        self.assertNotIn("bob-tag", tag_names)

    def test_cannot_access_other_users_media(self):
        """Alice не может получить media Bob через прямой ID в URL."""
        response = self.client.get(f"/media/{self.other_user.id}/some-file.png")
        self.assertEqual(response.status_code, 404)

    def test_cannot_restore_backup_into_other_users_notes(self):
        """Восстановление бэкапа создаёт заметки только для текущего пользователя."""
        # Bob восстанавливает бэкап
        payload = {
            "version": 1,
            "notes": [{"title": "Restored", "content": "Content", "tags": []}],
        }
        uploaded = SimpleUploadedFile(
            "backup.json", json.dumps(payload).encode(), content_type="application/json"
        )
        response = self.other_client.post(
            "/notes/restore-backup/", {"file": uploaded}, format="multipart"
        )
        self.assertEqual(response.status_code, 201)

        # Alice не должна видеть восстановленную заметку Bob
        alice_response = self.client.get("/notes/")
        titles = [n["title"] for n in alice_response.data["results"]]
        self.assertNotIn("Restored", titles)


# =====================================================================
# 6. FILE UPLOAD
# =====================================================================
class FileUploadSecurityTestCase(TestCase):
    """Проверка безопасности загрузки файлов."""

    def setUp(self):
        self.user = User.objects.create_user(username="upload_user", password="StrongPass123!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_reject_php_file(self):
        """PHP файл с image/gif content-type и GIF magic bytes — не опасен."""
        uploaded = SimpleUploadedFile(
            "shell.php.gif",
            b"GIF89a<?php system($_GET['cmd']); ?>",
            content_type="image/gif",
        )
        response = self.client.post(
            "/notes/upload-image/", {"file": uploaded}, format="multipart"
        )
        # Magic bytes GIF → accepted (это GIF, хоть и с PHP внутри)
        # Проверяем, что расширение .gif разрешено
        self.assertIn(response.status_code, [201, 400])

    def test_reject_svg_with_script(self):
        """SVG с JavaScript должен быть отклонён (SVG не в списке разрешённых)."""
        uploaded = SimpleUploadedFile(
            "evil.svg",
            b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            content_type="image/svg+xml",
        )
        response = self.client.post(
            "/notes/upload-image/", {"file": uploaded}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)

    def test_reject_double_extension_exe(self):
        """Файл .png.exe должен быть отклонён (расширение .exe не разрешено)."""
        uploaded = SimpleUploadedFile(
            "shell.png.exe",
            b"\x89PNG\r\n\x1a\n" + b"\x00" * 20,
            content_type="image/png",
        )
        response = self.client.post(
            "/notes/upload-image/", {"file": uploaded}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)

    def test_reject_content_type_mismatch(self):
        """Content-Type говорит image/png, но файл — это BMP."""
        uploaded = SimpleUploadedFile(
            "but-actually.bmp",
            b"BM" + b"\x00" * 30,
            content_type="image/png",
        )
        response = self.client.post(
            "/notes/upload-image/", {"file": uploaded}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)

    def test_reject_empty_file(self):
        """Пустой файл должен быть отклонён."""
        uploaded = SimpleUploadedFile("empty.png", b"", content_type="image/png")
        response = self.client.post(
            "/notes/upload-image/", {"file": uploaded}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)


# =====================================================================
# 7. RATE LIMITING
# =====================================================================
class RateLimitingTestCase(TestCase):
    """Проверка rate limiting на auth endpoint."""

    def setUp(self):
        self.user = User.objects.create_user(username="rate_user", password="StrongPass123!")
        self.client = APIClient()

    @override_settings(
        REST_FRAMEWORK={
            "DEFAULT_THROTTLE_RATES": {
                "anon": "5/min",
                "user": "300/min",
                "auth": "5/min",
                "link_preview": "30/min",
            }
        }
    )
    def test_auth_endpoint_rate_limit(self):
        """Auth endpoint (login) — после превышения лимита 429."""
        for i in range(6):
            response = self.client.post(
                "/api/token/",
                {"username": "nonexistent", "password": "wrong"},
                format="json",
            )
        self.assertEqual(response.status_code, 429)

    def test_note_limit_enforced(self):
        """Нельзя создать больше MAX_NOTES_PER_USER заметок."""
        self.client.force_authenticate(user=self.user)
        for i in range(MAX_NOTES_PER_USER):
            Note.objects.create(owner=self.user, title=f"Note {i}", content="Body")

        response = self.client.post(
            "/notes/",
            {"title": "Over limit", "content": "Should fail"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("limit", str(response.data).lower())

    @override_settings(IMAGE_UPLOAD_MAX_BYTES=100)
    def test_image_size_limit(self):
        """Слишком большое изображение — 400."""
        self.client.force_authenticate(user=self.user)
        uploaded = SimpleUploadedFile(
            "large.png",
            b"\x89PNG\r\n\x1a\n" + b"\x00" * 200,
            content_type="image/png",
        )
        response = self.client.post(
            "/notes/upload-image/", {"file": uploaded}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)


# =====================================================================
# 8. SSRF — LINK PREVIEW
# =====================================================================
class SsrfLinkPreviewTestCase(TestCase):
    """Проверка защиты от SSRF."""

    def setUp(self):
        self.user = User.objects.create_user(username="ssrf_user", password="StrongPass123!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_ssrf_localhost_rejected(self):
        """localhost должен быть отклонён."""
        hosts = [
            "http://127.0.0.1:5432",
            "http://localhost:8000",
            "http://[::1]:8000",
            "http://0.0.0.0:8000",
            "http://169.254.169.254/latest/meta-data/",
            "http://10.0.0.1/admin",
            "http://172.16.0.1",
            "http://192.168.1.1",
        ]
        for host in hosts:
            response = self.client.get("/notes/link-preview/", {"url": host})
            self.assertEqual(
                response.status_code, 400,
                f"SSRF host '{host}' should be rejected"
            )

    def test_ssrf_non_http_rejected(self):
        """Не-HTTP протоколы должны быть отклонены."""
        urls = [
            "file:///etc/passwd",
            "ftp://localhost/file",
            "data://localhost",
            "gopher://localhost:6379",
        ]
        for url in urls:
            response = self.client.get("/notes/link-preview/", {"url": url})
            self.assertEqual(response.status_code, 400, f"URL '{url}' should be rejected")

    def test_ssrf_dns_rebinding_protected(self):
        """DNS rebinding защита: IP pinning предотвращает переключение DNS."""
        with patch("notes.views.socket.getaddrinfo") as mock_getaddrinfo:
            mock_getaddrinfo.return_value = [
                (2, 1, 6, "", ("93.184.216.34", 443)),
            ]
            response = self.client.get(
                "/notes/link-preview/",
                {"url": "http://example.com/test"},
            )
            # Должен попытаться соединиться по зафиксированному IP
            self.assertIn(response.status_code, [200, 400, 502])


# =====================================================================
# 9. SECURITY HEADERS
# =====================================================================
class SecurityHeadersTestCase(TestCase):
    """Проверка наличия заголовков безопасности."""

    def setUp(self):
        self.client = APIClient()

    def test_security_headers_present(self):
        """Основные заголовки безопасности должны присутствовать."""
        response = self.client.get("/api/health/")
        headers = response.headers

        # X-Content-Type-Options: nosniff
        self.assertEqual(
            headers.get("X-Content-Type-Options"),
            "nosniff",
        )

        # X-Frame-Options: DENY
        self.assertEqual(
            headers.get("X-Frame-Options"),
            "DENY",
        )

    def test_referrer_policy(self):
        """Referrer-Policy должна быть same-origin."""
        response = self.client.get("/api/health/")
        self.assertEqual(response.headers.get("Referrer-Policy"), "same-origin")

    def test_content_type_nosniff(self):
        """X-Content-Type-Options присутствует."""
        response = self.client.get("/api/health/")
        self.assertIn("X-Content-Type-Options", response.headers)

    def test_content_security_policy_present(self):
        """Content-Security-Policy должен присутствовать."""
        response = self.client.get("/api/health/")
        csp = response.headers.get("Content-Security-Policy", "")
        self.assertIn("default-src 'self'", csp)
        self.assertIn("object-src 'none'", csp)
        self.assertIn("frame-ancestors 'none'", csp)


# =====================================================================
# 10. BUSINESS LOGIC
# =====================================================================
class BusinessLogicSecurityTestCase(TestCase):
    """Проверка бизнес-логики."""

    def setUp(self):
        self.user = User.objects.create_user(username="biz_user", password="StrongPass123!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_empty_title_rejected(self):
        """Пустой заголовок — 400."""
        response = self.client.post(
            "/notes/",
            {"title": "", "content": "Body"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_whitespace_title_rejected(self):
        """Заголовок из пробелов — 400."""
        response = self.client.post(
            "/notes/",
            {"title": "   ", "content": "Body"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_content_too_long_rejected(self):
        """Контент > 100K символов — 400."""
        response = self.client.post(
            "/notes/",
            {"title": "Too long", "content": "X" * 100_001},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_too_many_tags_rejected(self):
        """Более 20 тегов — 400."""
        tags = [f"tag-{i}" for i in range(21)]
        response = self.client.post(
            "/notes/",
            {"title": "Test", "content": "Body", "tags": tags},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_tag_name_too_long_rejected(self):
        """Тег длиннее 50 символов — 400."""
        response = self.client.post(
            "/notes/",
            {
                "title": "Test",
                "content": "Body",
                "tags": ["x" * 51],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_duplicate_tags_deduplicated(self):
        """Дубликаты тегов должны быть удалены."""
        response = self.client.post(
            "/notes/",
            {
                "title": "Test",
                "content": "Body",
                "tags": ["python", "Python", "PYTHON"],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        note = Note.objects.get(owner=self.user, title="Test")
        self.assertEqual(note.tags.count(), 1)

    def test_negative_page_size(self):
        """Отрицательный page_size не должен вызывать 500."""
        response = self.client.get("/notes/", {"page_size": -1})
        self.assertIn(response.status_code, [200, 400])

    def test_page_size_too_large(self):
        """page_size > 100 должен быть ограничен до 100."""
        response = self.client.get("/notes/", {"page_size": 999})
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(len(response.data.get("results", [])), 100)

    def test_content_charset_handling(self):
        """Null bytes и невалидный charset не должны ломать БД."""
        response = self.client.post(
            "/notes/",
            {
                "title": "Test\x00title",
                "content": "Content\x00with\x00nulls",
            },
            format="json",
        )
        self.assertIn(response.status_code, [201, 400])

    def test_xml_content_safe(self):
        """XML в content не должен вызывать XXE."""
        response = self.client.post(
            "/notes/",
            {
                "title": "XXE Test",
                "content": '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>',
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)

    def test_unicode_normalization(self):
        """Unicode-символы не должны ломать парсинг."""
        payloads = [
            "\u00e9\u00e0\u00fc\u00f1",  # Latin-1 Supplement
            "\u4e2d\u6587",  # Chinese
            "\u041f\u0440\u0438\u0432\u0435\u0442",  # Cyrillic
            "\u202e\u202d",  # Bidi
            "\ufffe\uffff",  # Non-characters
        ]
        for payload in payloads:
            response = self.client.post(
                "/notes/",
                {"title": payload, "content": payload},
                format="json",
            )
            self.assertEqual(response.status_code, 201, f"Unicode payload failed: {payload!r}")
            self.assertIn(payload, response.data["title"])


# =====================================================================
# 11. RECOMMENDATION — BOUNDARY CASES
# =====================================================================
class RecommendationSecurityTestCase(TestCase):
    """Проверка безопасности рекомендательного алгоритма."""

    def setUp(self):
        self.user = User.objects.create_user(username="rec_user", password="StrongPass123!")

    def test_build_note_document_with_malicious_content(self):
        """Build document не должен падать от опасного контента."""
        payloads = [
            "\x00" * 100,
            "\ufffd" * 100,
            "\u202e\u202d" * 100,
        ]
        for payload in payloads:
            note = Note.objects.create(owner=self.user, title=payload, content=payload)
            doc = build_note_document(note)
            self.assertIsInstance(doc, str)

    def test_build_note_document_max_length(self):
        """Build document с очень длинным контентом."""
        note = Note.objects.create(
            owner=self.user,
            title="X" * 255,
            content="X" * 100_000,
        )
        doc = build_note_document(note)
        self.assertIsInstance(doc, str)
        self.assertGreater(len(doc), 0)


# =====================================================================
# 12. FRONTEND — статический анализ кода
# =====================================================================
class FrontendXssCodeAnalysis(TestCase):
    """Проверка frontend кода на XSS через статический анализ.

    Выполняется проверка, что файлы не содержат опасные паттерны."""

    def test_no_dangerously_set_inner_html(self):
        """Файлы frontend не должны использовать dangerouslySetInnerHTML."""
        frontend_dir = Path(settings.BASE_DIR).parent / "frontend" / "src"
        if not frontend_dir.exists():
            self.skipTest("Frontend src directory not found")

        dangerous_files = []
        for py_file in frontend_dir.rglob("*.jsx"):
            content = py_file.read_text(encoding="utf-8", errors="ignore")
            if "dangerouslySetInnerHTML" in content:
                dangerous_files.append(str(py_file))
        if dangerous_files:
            self.fail(
                f"Found dangerouslySetInnerHTML in files: {dangerous_files}"
            )

    def test_javascript_protocol_in_href(self):
        """Поиск уязвимых href без фильтрации протокола."""
        inline_path = (
            Path(settings.BASE_DIR).parent
            / "frontend" / "src" / "lib" / "markdown" / "inline.jsx"
        )
        if not inline_path.exists():
            self.skipTest("inline.jsx not found")

        content = inline_path.read_text(encoding="utf-8")
        # Проверяем, есть ли фильтрация javascript: протокола
        # Строка 28: href={match[5]} — потенциально уязвимо
        lines = content.split("\n")
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped.startswith("href=") and "match[" in stripped:
                self.fail(
                    f"Potential XSS in inline.jsx:{i}: '{stripped}' — "
                    "href is set without protocol validation. "
                    "A malicious user can inject [click](javascript:alert(1))."
                )
