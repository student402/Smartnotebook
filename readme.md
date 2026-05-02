# SmartNotebook

SmartNotebook is a diploma project: a note-taking web application with a Django REST backend, a React frontend, JWT authentication, PostgreSQL storage, TF-IDF based note recommendations, and a single-page notes workspace with import/export and Markdown editing tools.

## Features

- User registration and JWT login
- Create, edit, delete, and browse notes
- Tag-based organization and filtering
- Full-text note search with PostgreSQL ranking and SQLite-compatible fallback
- Similar note recommendations using TF-IDF and cosine similarity
- Import notes from `.txt`, `.md`, and `.pdf`
- Export notes as `.txt`, `.md`, and `.pdf`
- Export all notes as a backup JSON file and restore them from a JSON backup
- Insert local images into notes from the editor
- Markdown-oriented editor with formatting helpers and preview mode
- Rich link previews and inline YouTube embeds for supported links
- Theme, language, and note text-size controls in the SPA options menu
- Paginated REST API for the SPA frontend

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | Python 3.11, Django 5.2.2, Django REST Framework 3.16.1, uv |
| Frontend | React 19, Vite, Axios, pnpm |
| Database | PostgreSQL 15 |
| Auth | `djangorestframework-simplejwt` |
| Recommendation logic | `scikit-learn` 1.8.0, `numpy` 2.4.4, TF-IDF, cosine similarity |
| Containerization | Docker, Docker Compose |

## Recent Improvements

- Fixed long note UI breaking issue by moving global CSS to component-scoped styling
- Added scrolling to sidebar tags section when many tags exist
- Enhanced tag editing with click-to-edit functionality (Enter to save, Escape to cancel)
- Added draft/auto-save functionality (persists in localStorage every 2 seconds)
- Improved note previews to show plain text without markdown formatting in sidebar/list/grid views
- Ensured proper word wrapping and line break preservation in all views
- Removed duplicate new note button and font size controls from sidebar for cleaner design
- Moved font size, language, and theme controls to main toolbar for better accessibility
- Eliminated unused space at bottom of sidebar for more compact design
- Added sticky editor formatting controls for long note editing
- Added a single table menu with multiple presets in the editor toolbar
- Added inline `+ Row` and `+ Column` controls for Markdown tables in preview mode and while writing inside a table
- Added backup export/restore, image upload, and Open Graph link preview support
- Scoped tags per owner and exposed only the current user's tags
- Fixed uploaded note images on Windows by normalizing media paths to browser-safe `/media/...` URLs

## Repository Structure

```text
smartnotebook_project/
├── backend/
│   ├── manage.py
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── scripts/
│   │   └── wait_for_db.py
│   ├── smartnotebook/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── asgi.py
│   │   └── wsgi.py
│   └── notes/
│       ├── admin.py
│       ├── models.py
│       ├── serializers.py
│       ├── views.py
│       ├── pagination.py
│       ├── recommendation.py
│       ├── tests.py
│       ├── urls.py
│       ├── management/commands/
│       │   └── reindex_note_vectors.py
│       └── services/
│           ├── tag_service.py
│           └── vector_service.py
├── frontend/
│   ├── .npmrc
│   ├── package.json
│   ├── package-lock.json
│   ├── pnpm-lock.yaml
│   ├── vite.config.js
│   ├── .env.example
│   └── src/
│       ├── App.css
│       ├── App.jsx
│       ├── index.css
│       ├── main.jsx
│       ├── components/
│       └── lib/
│           ├── api.js
│           ├── Login.jsx
│           ├── hooks/
│           ├── markdown/
│           └── utils/
├── docker-compose.yml
├── docker-compose.override.yml
├── .env.example
├── AGENTS.md
├── диаграммы.md
├── дипломный проект.md
└── readme.md
```

## Quick Start

### Requirements

- Docker and Docker Compose
- Node.js 22+ for local frontend development
- Python 3.11+ for local backend development

### Run with Docker

The repository contains both `docker-compose.yml` and `docker-compose.override.yml`. The override replaces the backend command with a plain `runserver`, so the most predictable startup is to explicitly use the base compose file:

```bash
cp .env.example .env
docker compose -f docker-compose.yml up --build
```

This starts:

- PostgreSQL on the internal Docker network
- Django backend on `http://localhost:8000`
- React dev server on `http://localhost:5173`
- A dedicated `test` service for backend test runs

Available URLs:

| Interface | URL |
| --- | --- |
| Frontend SPA | `http://localhost:5173/` |
| Django API root | `http://localhost:8000/` |
| JWT auth | `http://localhost:8000/api/token/` |
| Registration | `http://localhost:8000/api/register/` |
| Django admin | `http://localhost:8000/admin/` |

### Run Locally Without Docker

Backend:

```bash
cd backend
uv sync --frozen
uv run python manage.py migrate
uv run python manage.py reindex_note_vectors --all
uv run python manage.py runserver
```

Frontend:

```bash
cd frontend
corepack enable
pnpm install
pnpm run dev
```

For local development, Vite proxies `/notes`, `/tags`, `/api`, `/admin`, and `/media` to the backend server configured by `VITE_PROXY_TARGET`.

## Environment Variables

Root `.env.example` configures Django:

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

Frontend-specific variables live in `frontend/.env.example`:

```env
VITE_API_BASE_URL=
VITE_PROXY_TARGET=http://127.0.0.1:8000
VITE_PORT=5173
```

Notes:

- Leave `VITE_API_BASE_URL` empty to use the Vite proxy during local development.
- Set `VITE_API_BASE_URL` when the frontend should call a backend hosted on another origin.
- Set `USE_SQLITE=True` if you want a lightweight local backend without PostgreSQL.
- Set `USE_SQLITE_FOR_TESTS=False` if you want `manage.py test` to use PostgreSQL instead of the default SQLite test DB.
- `SECRET_KEY` is required for every non-test backend startup, including local development.
- `IMAGE_UPLOAD_MAX_BYTES`, `NOTE_IMPORT_MAX_BYTES`, and `BACKUP_RESTORE_MAX_BYTES` cap upload sizes for image upload, import, and backup restore endpoints.
- `SESSION_COOKIE_SECURE` and `CSRF_COOKIE_SECURE` should stay `False` for local HTTP development.

## API Overview

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/register/` | Public user registration |
| POST | `/api/token/` | Obtain JWT access and refresh tokens |
| POST | `/api/token/refresh/` | Refresh JWT access token |
| GET | `/notes/` | List current user notes with optional `tag`, `page`, and `page_size` |
| POST | `/notes/` | Create a note |
| POST | `/notes/import/` | Import a note from `.txt`, `.md`, or `.pdf` |
| GET | `/notes/{id}/` | Retrieve a note |
| PATCH | `/notes/{id}/` | Update a note |
| DELETE | `/notes/{id}/` | Delete a note |
| GET | `/notes/{id}/similar/` | Get similar notes |
| GET | `/notes/search/?q=...` | Search notes with optional `tag`, `page`, and `page_size` |
| GET | `/notes/link-preview/?url=...` | Fetch Open Graph preview data |
| GET | `/notes/backup/` | Export all current user notes as backup JSON |
| POST | `/notes/restore-backup/` | Restore notes from a JSON backup file |
| POST | `/notes/upload-image/` | Upload an image and return a normalized `/media/...` URL |
| GET | `/tags/` | List tags belonging to the current user and attached to that user's notes |

Frontend note export is currently implemented client-side in the React app.

SmartNotebook `.txt` and `.md` exports are import-compatible: re-importing them restores the note title, main content, and tags instead of saving the metadata block as plain text. Generic text and Markdown files are still imported as regular note content.
Import and backup restore also accept UTF-8 files with BOM and UTF-16 text/JSON, which improves compatibility with files created by Windows editors.

## Frontend Behavior

- The current SPA orchestration is centered in `frontend/src/App.jsx`, with reusable UI and helpers extracted under `src/components` and `src/lib`.
- Component-specific styles are in `frontend/src/App.css`.
- Authentication UI lives in `frontend/src/lib/Login.jsx`.
- Session and notes loading logic are encapsulated in `frontend/src/lib/hooks/useSession.js` and `frontend/src/lib/hooks/useNotes.js`.
- The app supports dark/light theme switching, RU/EN language switching, and note text-size preferences from the topbar options menu.
- Note text size is stored in `4px` steps starting at `16px`; the effective maximum is reduced on narrower screens to avoid layout breakage.
- Notes are edited in a Markdown-oriented textarea with quick formatting buttons and an inline preview mode.
- The editor formatting toolbar stays visible while editing long notes; the read-mode note header remains in normal document flow.
- Table insertion uses a single menu in the toolbar, with extra inline row/column controls when working inside a table.
- Markdown image syntax from imported or manually written notes still renders inline in the note view.
- Windows-style image URLs (`C:\...`, `C:/...`, `file:///...`) are normalized when they point to `/media/...`, so old exported notes render correctly after moving between Linux and Windows.
- Local image uploads insert inline Markdown image links and are exposed through `POST /notes/upload-image/`.
- Uploaded images use normalized browser paths, so the same note content works on Linux and Windows.

## Recommendation Logic

Semantic recommendations are implemented in [`backend/notes/recommendation.py`](backend/notes/recommendation.py). The backend builds TF-IDF vectors for user notes and ranks similar notes with cosine similarity. Content-changing writes invalidate stored vectors for that user, and recommendation requests fall back to live TF-IDF until vectors are rebuilt explicitly.

The backend note list and `/notes/search/` endpoints are paginated and accept optional `tag`, `page`, and `page_size` query params. The current frontend loads the first page with `page_size=20` and applies local view filtering in memory.

Stored vectors can be rebuilt explicitly with:

```bash
cd backend
uv run python manage.py reindex_note_vectors --all
uv run python manage.py reindex_note_vectors --username your_username
```

PostgreSQL full-text search is used only when the active DB connection is actually PostgreSQL. SQLite test runs cover the search branch through unit tests, but they still do not replace an end-to-end PostgreSQL integration run.
The Docker `test` service now sets `USE_SQLITE_FOR_TESTS=False` so the integration run exercises the PostgreSQL search path.

## Testing

Backend:

```bash
cd backend
uv run python manage.py test
```

Frontend:

```bash
cd frontend
pnpm run lint
pnpm run test
```

Docker test service:

```bash
docker compose -f docker-compose.yml run --rm test
```

## Additional Documentation

- [`backend/README_PROJECT.md`](backend/README_PROJECT.md)
- [`frontend/README_FRONTEND.md`](frontend/README_FRONTEND.md)

## License

This project was created for educational use as part of a diploma thesis.
