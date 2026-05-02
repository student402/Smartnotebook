# Frontend — SmartNotebook

React + Vite frontend for SmartNotebook. It provides login and registration, note browsing, a Markdown-oriented note editor, tag filtering, import/export flows, image insertion, and similar-note discovery.

## Stack

- React 19
- Vite 7
- Axios
- ESLint
- Vitest
- pnpm
- DM Sans with Plus Jakarta Sans display typography

## Local Setup

```bash
cd frontend
corepack enable
pnpm install
pnpm run dev
```

The dev server runs on `http://localhost:5173/` by default.

## Environment Variables

Frontend environment variables are documented in `frontend/.env.example`:

```env
VITE_API_BASE_URL=
VITE_PROXY_TARGET=http://127.0.0.1:8000
VITE_PORT=5173
```

How it works:

- `VITE_API_BASE_URL` is read by `src/lib/api.js`.
- If `VITE_API_BASE_URL` is empty, the app uses relative paths like `/notes/` and relies on the Vite proxy.
- `VITE_PROXY_TARGET` configures the dev proxy target in `vite.config.js`.
- `VITE_PORT` changes the Vite dev server port.

## Build, Lint, Test

```bash
pnpm run build
pnpm run lint
pnpm run test
```

Production assets are generated in `frontend/dist/`.

## Structure

```text
frontend/
├── .npmrc
├── .env.example
├── index.html
├── package.json
├── package-lock.json
├── pnpm-lock.yaml
├── vite.config.js
└── src/
    ├── App.css
    ├── App.jsx
    ├── index.css
    ├── main.jsx
    ├── lib/
    │   ├── Login.jsx
    │   ├── api.js
    │   ├── hooks/
    │   │   ├── useNotes.js
    │   │   └── useSession.js
    │   ├── markdown/
    │   │   ├── checklist.js
    │   │   ├── highlight.jsx
    │   │   ├── inline.jsx
    │   │   ├── links.js
    │   │   ├── render.jsx
    │   │   ├── table.js
    │   │   └── youtube.js
    │   └── utils/
    │       ├── date.js
    │       ├── detect.js
    │       ├── error.js
    │       ├── export.js
    │       ├── preview.js
    │       ├── tagColor.js
    │       └── url.js
    ├── components/
    │   ├── Icon.jsx
    │   ├── controls/
    │   │   ├── FontSizeSwitch.jsx
    │   │   ├── LanguageSwitch.jsx
    │   │   └── ThemeSwitch.jsx
    │   ├── editor/
    │   │   └── NoteEditor.jsx
    │   ├── media/
    │   │   ├── LinkPreviewCard.jsx
    │   │   └── YouTubePreview.jsx
    │   ├── notes/
    │   │   ├── NoteCardContextMenu.jsx
    │   │   ├── NotesGridContent.jsx
    │   │   ├── NotesListContent.jsx
    │   │   └── NoteView.jsx
    │   └── tags/
    │       └── TagsInput.jsx
    └── ...
```

## UI Capabilities

- User login and public registration
- Login screen with dedicated hero copy for theme/language onboarding
- Sidebar note list with local search and tag filtering over the loaded notes page (scrollable when many tags)
- List and grid note views
- Note editor with inline tag management (click-to-edit tags)
- Markdown formatting helpers and write/preview mode
- Note detail page with similar-note recommendations
- Light and dark theme switching
- RU and EN language switching
- Note text-size controls in the topbar options menu
- Import notes from `.txt`, `.md`, and `.pdf`
- Export notes as `.txt`, `.md`, and `.pdf`
- Export all notes to JSON backup and restore notes from a JSON backup
- Insert local images into notes and support drag-and-drop image insertion
- JWT token storage and automatic auth header injection
- Auto-save draft functionality (persists in localStorage)
- Plain text preview in sidebar (shows clean text without markdown formatting)
- Responsive note-view typography with `smartnotebook-note-font-size` persisted in localStorage and smaller effective max sizes on narrow windows

## API Usage

The frontend uses the shared Axios client in `src/lib/api.js` for all requests.

Endpoints currently used by the UI:

| Action         | Method | URL                                                   |
| -------------- | ------ | ----------------------------------------------------- |
| Register       | POST   | `/api/register/`                                      |
| Login          | POST   | `/api/token/`                                         |
| Refresh token  | POST   | `/api/token/refresh/`                                 |
| List notes     | GET    | `/notes/?page=...&page_size=...&tag=...`              |
| Get note       | GET    | `/notes/{id}/`                                        |
| Create note    | POST   | `/notes/`                                             |
| Import note    | POST   | `/notes/import/`                                      |
| Update note    | PATCH  | `/notes/{id}/`                                        |
| Delete note    | DELETE | `/notes/{id}/`                                        |
| Similar notes  | GET    | `/notes/{id}/similar/`                                |
| Search notes    | GET    | `/notes/search/?q=...&page=...&page_size=...&tag=...` |
| List tags       | GET    | `/tags/`                                              |
| Link preview    | GET    | `/notes/link-preview/?url=...`                        |
| Backup export  | GET    | `/notes/backup/`                                      |
| Backup restore | POST   | `/notes/restore-backup/`                              |
| Upload image   | POST   | `/notes/upload-image/`                                |

Note export is handled in the SPA and does not require a dedicated backend export endpoint.

SmartNotebook `.txt` and `.md` exports are designed to round-trip through the import flow: when a user re-imports one of those exported files, the backend restores the note title, body, and tags.
Markdown images with Windows-style paths (`C:\...`, `C:/...`, `file:///...`) are recognized and normalized when they reference `/media/...`.

The topbar groups theme, language, and text-size controls inside an options menu. Text size is stored in `4px` steps starting at `16px`, but the effective maximum is reduced on smaller windows to prevent layout issues.

## Dev Proxy

The current app loads the first notes page with `page_size=20`; list/grid/sidebar filtering is local to the loaded notes until additional pagination UI is added.

`vite.config.js` proxies these paths to the backend during development:

- `/notes`
- `/tags`
- `/api`
- `/admin`
- `/media`
