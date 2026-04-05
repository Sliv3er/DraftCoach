---
description: How to build the DraftCoach production installer (.exe)
---

# Build DraftCoach Installer

This workflow produces a branded Windows installer for DraftCoach using **electron-builder + Squirrel.Windows**. 

## Why Squirrel?
Squirrel provides a "silent", 1-click install experience similar to Discord, Spotify, and VS Code. It completely bypasses the native Windows wizard UI in favor of a sleek, animated splash screen.

## Prerequisites

- Node.js 18+ installed
- All dependencies installed (`npm install` in root AND `apps/desktop`)
- `.env` file configured with `GEMINI_API_KEY`

## Step 1 — Install dependencies

```bash
npm install
cd apps/desktop && npm install
```

## Step 2 — Build the shared engine (if changed)

```bash
npm run build:engine
```

This compiles `shared/engine/*.ts` → `shared/engine/dist/` which gets bundled as an extraResource.

## Step 3 — Build production bundle + installer

```bash
cd apps/desktop
npm run build
```

This runs:
1. `webpack --mode production` → compiles React renderer to `apps/desktop/dist/`
2. `electron-builder --win` → packages Electron app + creates Squirrel installer

**Output:** `apps/desktop/dist-electron/DraftCoach Setup *.exe`

## Architecture of the Installer

### Configuration (`package.json`)

The installer is configured in `apps/desktop/package.json`:

```json
"target": ["squirrel"],
"squirrelWindows": {
  "iconUrl": "https://raw.githubusercontent.com/Sliv3er/DraftCoach/main/assets/icon.ico",
  "setupIcon": "../../assets/icon.ico",
  "loadingGif": "../../assets/splash.gif",
  "remoteReleases": "https://github.com/Sliv3er/DraftCoach"
}
```

**Key settings:**
- `target`: `squirrel` creates the silent installer executable.
- `iconUrl`: An absolute URL to the remote `.ico` file, which Windows uses in the Add/Remove Programs panel.
- `setupIcon`: The icon used for the `Setup.exe` file itself.
- `loadingGif`: The animated splash screen that plays in the center of the screen while installing.
- `remoteReleases`: URL to the GitHub repo to enable automatic delta updates via Squirrel.

### Branding Assets (`assets/`)

| File | Purpose |
|------|---------|
| `icon.png` | Source high-res logo used in the app |
| `icon.ico` | Multi-resolution icon for Windows taskbar and executables |
| `splash.gif` | The animated pulsing logo + precise loading bar shown during installation |

**To regenerate these images** (if logo changes):

```bash
python tools/gen-squirrel-assets.py
```

Requires Python 3 + Pillow (`pip install Pillow`).

### Extra Resources

The installer bundles these additional resources (see `build.extraResources`):
- `assets/icon.png` → Application icon
- `shared/engine/dist/` → Compiled decision engine
- `shared/kb/data/` → Knowledge base JSON files
- `apps/backend/data/rag/` → RAG context data

### Production .env Loading

In production, the app loads `.env` from (checked in order):
1. `%APPDATA%/DraftCoach/.env`
2. Next to the `.exe` file
3. The `resources/` folder inside the app package

## Installer Flow (User Experience)

1. User clicks `DraftCoach Setup 1.0.0.exe`
2. A borderless window opens in the center of the screen playing `splash.gif`.
3. DraftCoach installs silently in the background into `%LOCALAPPDATA%/DraftCoach`.
4. A desktop shortcut and start menu shortcut are automatically created.
5. The splash screen closes, and DraftCoach launches automatically.
