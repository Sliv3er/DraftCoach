---
description: How to build the DraftCoach production installer (.exe)
---

# Build DraftCoach Installer

This workflow produces a branded Windows installer for DraftCoach using electron-builder + NSIS.

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
2. `electron-builder --win` → packages Electron app + creates NSIS installer

**Output:** `apps/desktop/dist-electron/DraftCoach Setup *.exe`

## Architecture of the Installer

### NSIS Configuration

The installer is configured in `apps/desktop/package.json` under the `build.nsis` section:

```json
{
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "installerSidebar": "../../assets/installer/installer-sidebar.bmp",
    "installerHeader": "../../assets/installer/installer-header.bmp",
    "include": "build/installer.nsh",
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "DraftCoach"
  }
}
```

**Key settings:**
- `oneClick: false` — Uses assisted (wizard) installer with Welcome → Directory → Install → Finish pages
- Custom BMP images for sidebar (164×314) and header (150×57) branding
- `build/installer.nsh` — Custom NSIS script with dark theme colors and branded text

### Custom NSIS Script (`build/installer.nsh`)

This file is automatically included by electron-builder. It defines:
- **MUI2 dark theme** — Background `#010A13`, text `#F0E6D2` (matching the LoL client palette)
- **Welcome page** — Branded text describing DraftCoach features
- **Finish page** — "Launch DraftCoach" checkbox + GitHub link
- **Shortcuts** — Desktop and Start Menu shortcuts created in `customInstall` macro
- **Uninstaller** — Cleans up shortcuts in `customUnInstall` macro

### Branding Assets (`assets/installer/`)

| File | Size | Purpose |
|------|------|---------|
| `installer-sidebar.bmp` | 164×314 | Welcome/Finish page left sidebar |
| `installer-header.bmp` | 150×57 | All wizard pages header bar |
| `uninstaller-sidebar.bmp` | 164×314 | Uninstaller sidebar |
| `uninstaller-header.bmp` | 150×57 | Uninstaller header |

**To regenerate these images** (if logo changes):

```bash
python tools/gen-installer-images.py
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

1. **Welcome Page** — DraftCoach logo, sidebar image, description text
2. **Directory Selection** — Default: `%LOCALAPPDATA%/Programs/DraftCoach/`
3. **Installation Progress** — Standard NSIS progress bar
4. **Finish Page** — "Launch DraftCoach" checkbox (checked by default), GitHub link

## Common Issues

### "Cannot find module" errors during build
Run `npm install` in both the root and `apps/desktop/` directories.

### NSIS images not loading
Ensure images are valid BMP format at exact dimensions (164×314 sidebar, 150×57 header). Regenerate using `python tools/gen-installer-images.py`.

### electron-builder version
The project uses `electron-builder ^26.8.1`. Check `apps/desktop/package.json` for the current version.

### Icon format
The `.ico` file at `assets/icon.ico` must be a valid multi-resolution ICO file. The current one includes 16, 32, 48, 64, 128, and 256px sizes.
