# SmartNotebook

SmartNotebook is a note-taking web app with a Django REST backend, a React/Vite frontend, JWT authentication, PostgreSQL storage, Markdown editing, imports/exports, image uploads, link previews, and TF-IDF note recommendations.

## Features

- Register and sign in with JWT auth.
- Create, edit, delete, search, tag, import, and export notes.
- Import `.txt`, `.md`, and `.pdf`; export notes and JSON backups.
- Upload local images into notes.
- Render Markdown, checklists, tables, rich links, and YouTube embeds.
- Recommend similar notes with TF-IDF and cosine similarity.

## Stack

- Backend: Python 3.11, Django 5.2, Django REST Framework, Simple JWT, uv.
- Frontend: React 19, Vite, Axios, pnpm.
- Database: PostgreSQL 15, with SQLite support for lightweight local/test runs.
- Tools: Docker Compose, Ruff, Vitest, ESLint.

## Project Layout

```text
backend/
  smartnotebook/      Django settings and root URLs
  notes/              app models, serializers, views, tests, services
  manage.py
  pyproject.toml
frontend/
  src/                React app source
  src/components/     UI components
  src/lib/            API, hooks, Markdown, utility helpers
  package.json
docker-compose.yml
.env.example
```

## Run With Docker

```bash
cp .env.example .env
docker compose -f docker-compose.yml up --build
```

Services:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Admin: `http://localhost:8000/admin`

## Run Locally

Backend:

```bash
cd backend
uv sync --frozen
uv run python manage.py migrate
uv run python manage.py runserver
```

Frontend:

```bash
cd frontend
corepack enable
pnpm install
pnpm run dev
```

Leave `VITE_API_BASE_URL` empty in local frontend development to use the Vite proxy.

## Tests

```bash
cd backend
uv run python manage.py test
```

```bash
cd frontend
pnpm run lint
pnpm run test
```

Docker backend test service:

```bash
docker compose -f docker-compose.yml run --rm test
```

## Configuration

Copy `.env.example` to `.env`. Set `SECRET_KEY` for every non-test backend run. Use `USE_SQLITE=True` for a local SQLite backend, or keep the PostgreSQL settings from the Docker Compose stack.

Upload limits are controlled by:

- `IMAGE_UPLOAD_MAX_BYTES`
- `NOTE_IMPORT_MAX_BYTES`
- `BACKUP_RESTORE_MAX_BYTES`

## License

This project is licensed under the GNU General Public License v3.0. See [LICENSE](LICENSE).
