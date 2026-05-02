# Backend — SmartNotebook

Django backend for SmartNotebook. It exposes a JWT-protected REST API, note import, backup/restore, link preview, image upload, and TF-IDF based note recommendation endpoints.

## Stack

- Python 3.11
- Django 5.2.x
- Django REST Framework 3.16.x
- PostgreSQL by default
- Optional SQLite for local development
- `djangorestframework-simplejwt`
- `scikit-learn` 1.8.x and `numpy` 2.4.x
- `pypdf` 6.10.x
- `uv`
- `ruff`

## Local Setup

```bash
cd backend
uv sync --frozen
uv run python manage.py migrate
uv run python manage.py createsuperuser
uv run python manage.py runserver
```

The backend runs on `http://localhost:8000/`.

## Configuration

Backend settings are driven by environment variables read in `smartnotebook/settings.py`.

Common variables:

```env
SECRET_KEY=replace_me_with_a_real_secret
DEBUG=True
TIME_ZONE=UTC
ALLOWED_HOSTS=127.0.0.1,localhost
CORS_ALLOW_ALL_ORIGINS=False
CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
DB_NAME=smartnotebook
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
USE_SQLITE=False
IMAGE_UPLOAD_MAX_BYTES=5242880
NOTE_IMPORT_MAX_BYTES=10485760
BACKUP_RESTORE_MAX_BYTES=5242880
SESSION_COOKIE_SECURE=False
CSRF_COOKIE_SECURE=False
```

Notes:

- PostgreSQL is the default database.
- Set `USE_SQLITE=True` to run without PostgreSQL.
- Tests default to SQLite via `test_db.sqlite3`; set `USE_SQLITE_FOR_TESTS=False` to run the test suite against PostgreSQL.
- `SECRET_KEY` is required for every non-test backend startup.
- `GET /notes/link-preview/` accepts only public URLs; localhost and private network targets are rejected.
- `POST /notes/upload-image/` validates image signatures and respects `IMAGE_UPLOAD_MAX_BYTES`.
- `POST /notes/import/` and `POST /notes/restore-backup/` enforce `NOTE_IMPORT_MAX_BYTES` and `BACKUP_RESTORE_MAX_BYTES`.
- `SESSION_COOKIE_SECURE` and `CSRF_COOKIE_SECURE` should stay `False` for local HTTP development.

## Structure

```text
backend/
├── manage.py
├── Dockerfile
├── pyproject.toml
├── uv.lock
├── scripts/
│   └── wait_for_db.py
├── smartnotebook/
│   ├── settings.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
└── notes/
    ├── admin.py
    ├── models.py
    ├── pagination.py
    ├── recommendation.py
    ├── serializers.py
    ├── tests.py
    ├── urls.py
    ├── views.py
    ├── management/commands/
    │   └── reindex_note_vectors.py
    ├── migrations/
    ├── services/
    │   ├── tag_service.py
    │   └── vector_service.py
```

## URL Map

Auth and registration:

- `POST /api/register/`
- `POST /api/token/`
- `POST /api/token/refresh/`

REST API:

- `GET /notes/` with optional `tag`, `page`, and `page_size`
- `POST /notes/`
- `POST /notes/import/`
- `GET /notes/link-preview/?url=...`
- `GET /notes/backup/`
- `POST /notes/restore-backup/`
- `POST /notes/upload-image/`
- `GET /notes/{id}/`
- `PATCH /notes/{id}/`
- `DELETE /notes/{id}/`
- `GET /notes/{id}/similar/`
- `GET /notes/search/?q=...` with optional `tag`, `page`, and `page_size`
- `GET /tags/` for current-user tags attached to current-user notes

Admin:

- `GET /admin/`

## Tags

Tags are scoped by owner. `Tag` has an `owner` foreign key and a unique `(owner, name)` constraint, and `TagViewSet` returns only tags owned by the current user and attached to that user's notes. Tag creation and reuse are centralized in `notes/services/tag_service.py`.

## Recommendation Logic

Recommendation logic lives in `notes/recommendation.py`. That is the canonical place for similar-note ranking.

High-level flow:

1. Collect the current user's notes.
2. Build TF-IDF vectors from note text.
3. Blend cosine similarity with tag overlap scoring.
4. Return the most similar note queryset.

Stored note vectors are maintained by `notes/services/vector_service.py`. Create, update, and import flows invalidate the affected user's stored vectors so recommendation requests fall back to live TF-IDF until the next explicit reindex. Bulk backup restore still rebuilds the owner corpus once after all notes are recreated. Recommendation scoring and stored vectors share the same canonical TF-IDF document builder and vectorizer settings.

## Import Notes

The backend supports note import at `POST /notes/import/`.

Accepted formats:

- `.txt`
- `.md`
- `.pdf`

The PDF path depends on `pypdf`, which is declared in `backend/pyproject.toml` and pinned in `backend/uv.lock`.

Import behavior:

- Generic `.txt` and `.md` files are imported as plain note content.
- SmartNotebook-generated `.txt` and `.md` exports are parsed on import so the note title, body, and tags are restored.
- Text import and backup restore accept UTF-8 (with or without BOM) and UTF-16 files for better Windows editor compatibility.
- `.pdf` files are imported as extracted text only.
- `POST /notes/restore-backup/` accepts a JSON backup payload and recreates notes for the current user.
- `POST /notes/upload-image/` stores uploaded images under `media/note-images/` and returns a normalized browser-safe `/media/...` URL.
- Uploaded image URLs are normalized to forward-slash web paths so the same API behavior works on Linux and Windows.

## Docker Notes

The backend Docker image is defined in `backend/Dockerfile`. In `docker-compose.yml`, the backend service:

- waits for PostgreSQL using `scripts/wait_for_db.py`
- runs migrations
- starts Gunicorn on `0.0.0.0:8000`

The repository also includes `docker-compose.override.yml`, which overrides the backend command. If you want the documented startup behavior, run:

```bash
docker compose -f docker-compose.yml up --build
```

## Tests

```bash
cd backend
uv run python manage.py test
```

## Lint

```bash
cd backend
uv run ruff check .
uv run ruff format --check .
```

The compose-based test runner is:

```bash
docker compose -f docker-compose.yml run --rm test
```
