# Security Changes Review

## Changes made in this pass

- Hardened `/notes/upload-image/` in `backend/notes/views.py`.
  - Re-encodes all accepted image formats with Pillow: PNG, JPEG, GIF, WebP, BMP.
  - Strips EXIF metadata with `exif=b""`.
  - Rejects malformed image bodies instead of accepting files that only match magic bytes.
  - Saves the cleaned image bytes, not the original upload stream.

- Updated upload tests in `backend/notes/tests.py`.
  - Replaced fake PNG fixture bytes with a real 1x1 PNG.

- Updated security upload expectation in `backend/notes/test_security.py`.
  - `image/png` content type with BMP body is now rejected with `400`.

- Updated `SECURITY_FIXES.md`.
  - Removed the stale claim that non-JPEG formats pass through unchanged.
  - Updated SQLite security test count to `61/61 PASS`.
  - Marked PostgreSQL security tests as not rerun after upload hardening.

## Verification

- `backend\.venv\Scripts\python.exe backend\manage.py test notes.tests.UploadImageTestCase`
  - Result: `5/5 PASS`

- `backend\.venv\Scripts\python.exe backend\manage.py test notes.test_security`
  - Result: `61/61 PASS` on SQLite
  - Note: vector-service SQLite lock messages appeared in logs, but tests passed.

- `pnpm audit --prod=false`
  - Result: `2 low` vulnerabilities remain.
  - Remaining packages: `esbuild`, `@babel/core`.

## Not changed

- No dependency overrides were added for the two remaining low dev-only findings.
- PostgreSQL security tests were not rerun in this pass.
