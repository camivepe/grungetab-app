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

Merging to `main` triggers GitHub Actions (`.github/workflows/deploy.yml`), which injects three GitHub secrets into `index.html` and deploys to GitHub Pages:
- `GOOGLE_CLIENT_ID` — OAuth client ID
- `ALLOWED_EMAIL` — the only Google account allowed to log in
- `TABS_FOLDER_ID` — root Drive folder ID for the tablature library

## Access control

The app is locked to a single user via two layers:
1. **Google Cloud Console** — OAuth app kept in *Testing* mode with only the owner's email as a test user. Google rejects all other accounts at the OAuth level.
2. **Post-login email check** — `onGoogleLogin` decodes the JWT credential and compares `payload.email` against `CONFIG.allowedEmail` before requesting an access token.

## Architecture

The app is entirely self-contained in four files:
- `index.html` — three screens in one HTML file: `#screen-login`, `#screen-list`, `#screen-reader`. Contains a `<script>` block that sets `window.GRUNGETAB_CONFIG` with the three injected values.
- `app.js` — all application logic (auth, Drive API, rendering, scroll engine)
- `style.css` — theming via CSS custom properties on `body.dark` / `body.light`
- `sw.js` — service worker for offline caching

**Auth flow:** Google Identity Services button → `onGoogleLogin` (email verified) → `initOAuthClient()` requests an OAuth2 access token with Drive + Docs read-only scopes. The token lives only in memory (`state.accessToken`).

**Folder navigation:** `loadFolder(id, name)` lists both Google Docs and subfolders inside a given Drive folder. Navigation history is tracked in `state.folderStack` (array of `{id, name}`). `navigateInto()` pushes to the stack; `navigateUp()` pops. The `#btn-list-back` button is hidden when at the root and visible inside any subfolder.

**Rendering:** The Google Docs API response is parsed in `renderGoogleDoc()` → `renderParagraph()` / `renderTable()`. Images use `contentUri` from `inlineObjects`. The global `doc_current` variable holds the current doc so `renderParagraph` can resolve inline image references.

**Scroll engine:** Uses `requestAnimationFrame` with sub-pixel accumulation (`state.scrollAccum`) to achieve smooth, speed-adjustable auto-scroll. Speed levels 1–4 map to 8/22/40/80 px/s.

**Screen navigation:** `showScreen(name)` toggles `.hidden` on the three screen divs. State is kept in the `state` object.

**Theme:** Persisted in `localStorage` under `grungetab-theme`. Applied via `body.dark` / `body.light` CSS classes; all colors are CSS custom properties.