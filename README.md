# DraftCoach

League of Legends champ select assistance desktop app. Generates optimized builds using AI (Gemini with Google Search grounding) based on your draft.

## Features

- **AI-powered builds** — Runes, summoners, skill order, items adapted to enemy comp
- **Google Search grounding** — Verifies current patch data via search
- **Smart caching** — 24h cache with stale fallback when AI is unavailable
- **DDragon integration** — Champion icons, item icons fetched and cached locally
- **Dark theme** — Clean, minimal UI

## Project Structure

```
apps/
  backend/    — Express API server (Gemini AI integration)
  desktop/    — Electron + React frontend
shared/       — TypeScript types shared between apps
```

## Setup

1. Clone the repo
2. Copy `.env.example` to `.env` and add your Gemini API key
3. Install dependencies:

```bash
npm install
```

4. Run in development:

```bash
npm run dev
```

This starts both the backend (port 3210) and the Electron app.

## Build for Windows

```bash
npm run build:desktop
```

Output will be in `apps/desktop/dist-electron/`.

## API

### POST /api/build

Request:
```json
{
  "patch": "26.4",
  "myChampion": "Jinx",
  "role": "adc",
  "allies": ["Thresh", "LeeSin", "Ahri", "Malphite"],
  "enemies": ["Caitlyn", "Nautilus", "Zed", "Orianna", "Garen"]
}
```

Success response:
```json
{
  "ok": true,
  "source": "grounded",
  "patchDetected": "26.4",
  "text": "RUNES\n..."
}
```

Error response:
```json
{
  "ok": false,
  "source": "error",
  "message": "...",
  "canRetry": true
}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Model ID (`gemini-2.0-flash` or `gemini-2.0-pro`) |
| `BACKEND_PORT` | `3210` | Backend server port |
