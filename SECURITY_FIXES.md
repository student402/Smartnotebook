# Security Fixes — SmartNotebook

## 1. Frontend Dependency Vulnerabilities (pnpm audit)

**Before:** 28 vulnerabilities (1 critical, 13 high, 11 moderate, 3 low)
**After:** 2 low-severity (dev-only transitive deps)

### Updated packages
| Package | From | To | Reason |
|---------|------|----|--------|
| axios | ^1.13.5 | 1.16.0 | 1 critical, 7 high, 10 moderate, 1 low — various prototype pollution, SSRF, credential leak, ReDoS |
| vite | ^7.3.1 | 8.1.0 | 1 high (Windows fs.deny bypass), 1 moderate (NTLM hash leak) |
| vitest | 3.2.4 | 3.2.6 | 1 critical (UI server arbitrary file read) |

### Remaining (accepted risk)
- `esbuild` (vite dep) — low, Windows dev server only
- `@babel/core` (eslint dep) — low, sourcemap file read

---

## 2. EXIF Stripping on Image Upload

**File:** `backend/notes/views.py:701-715`

Images uploaded to `/notes/upload-image/` are now re-encoded via Pillow with `exif=b""`, removing EXIF metadata (GPS coordinates, camera model, timestamps, etc.) and rejecting malformed image bodies.

- Supported formats: PNG, JPEG, GIF, WebP, BMP.
- Added `Pillow==11.3.0` to `backend/pyproject.toml`.
- On processing failure, returns `400 Bad Request` — image is not saved.

---

## 3. Content-Security-Policy Header

**New file:** `backend/notes/middleware.py`

Adds `Content-Security-Policy` header to all responses:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; connect-src 'self'; font-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

- Disabled via `CSP_ENABLED=False` env var (default: `True`).
- Configurable via `CSP_POLICY` setting.

**Registered in** `MIDDLEWARE` in `backend/smartnotebook/settings.py`.

---

## 4. HSTS (HTTP Strict-Transport-Security)

**File:** `backend/smartnotebook/settings.py`

| Setting | Value (production) |
|---------|-------------------|
| `SECURE_HSTS_SECONDS` | 31,536,000 (1 year) |
| `SECURE_HSTS_INCLUDE_SUBDOMAINS` | True |
| `SECURE_HSTS_PRELOAD` | True |

Disabled in DEBUG mode (0 seconds).

---

## 5. Security Tests Added

**File:** `backend/notes/test_security.py:766-771`

New test `test_content_security_policy_present` — verifies CSP header contains `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`.

---

## Test Results

| Suite | SQLite | PostgreSQL |
|-------|--------|------------|
| Security tests (61) | **61/61 PASS** | Not rerun after upload hardening |
| Original tests | 52/58 pass (4 fail, 2 err, 1 skip) | 46/58 pass (12 fail, 1 err, 1 skip) |

All failures are **pre-existing** and unrelated to these changes:
- Vector service thread lock on SQLite (not an issue on PostgreSQL)
- Emoji encoding on Windows cp1251
- Registration response format mismatch
- Search tests failing on PostgreSQL (pre-existing)

Vector service / recommendation tests **pass on PostgreSQL**.
