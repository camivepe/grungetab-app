# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GrungeTab is a vanilla JS Progressive Web App (PWA) — no build tools, no bundler, no package manager. It's a guitar tablature reader with auto-scroll that reads Google Docs from a specific Drive folder.

## Local development

Requires a `.env.local` file (git-ignored) with:
```
GOOGLE_CLIENT_ID=your_client_id_here
ALLOWED_EMAIL=your@gmail.com
TABS_FOLDER_ID=google_drive_folder_id
```

**Generate the local HTML and open in browser:**
```bash
./dev.sh --serve      # generates index.local.html + starts Python HTTP server on :8080
./dev.sh              # only generates index.local.html (open via WebStorm built-in server)
```

`index.local.html` is generated from `index.html` with all three `__PLACEHOLDERS__` replaced. Never commit it.

The Service Worker is intentionally disabled on `localhost` — it only activates in production.

## Deployment

Merging to `main` triggers GitHub Actions (`.github/workflows/deploy.yml`), which injects values into source files and deploys to GitHub Pages:
- `index.html` receives three GitHub secrets: `GOOGLE_CLIENT_ID`, `ALLOWED_EMAIL`, `TABS_FOLDER_ID`
- `sw.js` receives `$(git rev-parse --short HEAD)` as `__CACHE_VERSION__`, so each deploy gets a unique cache name (e.g. `grungetab-a1b2c3d`) and the browser discards stale cached assets automatically.

## Access control

The app is locked to a single user via two layers:
1. **Google Cloud Console** — OAuth app kept in *Testing* mode with only the owner's email as a test user. Google rejects all other accounts at the OAuth level.
2. **Post-login email check** — `onGoogleLogin` validates the ID token against `https://oauth2.googleapis.com/tokeninfo` (verifies signature, expiry, and `aud`), then compares `payload.email` against `CONFIG.allowedEmail` before requesting an access token.

## Architecture

The app is entirely self-contained in four files:
- `index.html` — three screens in one HTML file: `#screen-login`, `#screen-list`, `#screen-reader`. Contains a `<script>` block that sets `window.GRUNGETAB_CONFIG` with the three injected values.
- `app.js` — all application logic (auth, Drive API, rendering, scroll engine)
- `style.css` — theming via CSS custom properties on `body.dark` / `body.light`
- `sw.js` — service worker for offline caching
