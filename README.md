<p align="center">
  <img src="assets/icon.png" alt="DraftCoach Logo" width="120" />
  <h1 align="center">DraftCoach</h1>
  <p align="center">
    <strong>AI-powered League of Legends companion — real-time builds, live scouting, cooldown tracking, and performance analytics</strong>
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/Season-2026-gold?style=flat-square" alt="Season 2026" />
    <img src="https://img.shields.io/badge/Patch-26.5-blue?style=flat-square" alt="Patch 26.5" />
    <img src="https://img.shields.io/badge/Gemini_AI-Grounded-green?style=flat-square" alt="Gemini AI" />
    <img src="https://img.shields.io/badge/Platform-Windows-lightgrey?style=flat-square" alt="Windows" />
    <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT" />
  </p>
</p>

---

## What is DraftCoach?

DraftCoach is a full-featured desktop companion for League of Legends that goes far beyond simple build recommendations. It connects to the League Client and Live Game APIs to provide **real-time intelligence** throughout every phase of the game — from champion select to post-game analysis.

Unlike static tier lists or basic build sites, DraftCoach uses **Google Gemini AI with Search Grounding** to analyze your draft, scout your opponents, track enemy cooldowns, and adapt your build live during the game.

---

## ✨ Features

### 🧠 AI-Grounded Builds
- **Draft-aware build generation** — input your champion, role, allies, and enemies to get comp-specific itemization
- **Gemini 3.1 Pro with Google Search Grounding** ensures recommendations reflect the current meta
- Complete builds: runes, summoner spells, skill order, starting items, core build (6-7 items), and situationals
- **Local Decision Engine** — instant (<30ms) build recommendations from a rules-based knowledge base, with AI fallback

### 🎮 In-Game Overlay
- **Transparent HUD overlay** that sits on top of the game
- **Next Item Tracker** — shows what to buy next with gold tracking and "READY TO BUY" alerts
- **Component breakdown** — see which component to purchase when you can't afford the full item
- **Build progress strip** — visual checklist of your entire build order
- **Jungle path overlay** — numbered route displayed directly on the minimap for junglers

### 🔍 Live Scouting (Pre-Game)
- **Auto-generated scout reports** during loading screen via Riot API
- Player ranks (Solo/Duo + Flex), win rates, recent match history, and KDA
- **Threat ratings** (1-10) for each enemy with AI-generated notes
- **Smurf detection** and **mental state analysis** (ON FIRE / TILTED / etc.)
- **Lane matchup breakdown** — early game assessment, power spikes, play tips, and danger windows
- **Team strategy** — win condition, focus targets, avoid targets, and objective priority
- **Win probability** estimate

### ⏱️ Cooldown Tracker
- **Click-to-track** enemy summoner spells and ultimates from the scoreboard
- **Real-time countdown** with sweep animation on spell icons
- Cooldowns account for **Cosmic Insight**, **Ionian Boots**, and **Summoner Spell Haste** items
- **Overlay integration** — active timers appear as a strip on the in-game HUD
- **Tracker panel** — compact side panel for quick cooldown monitoring

### 📊 Live Scoreboard
- **Real-time scoreboard window** with all 10 players' KDA, items, CS, and levels
- Click enemy champion portraits to track their ultimate cooldown
- Click enemy summoner spells to start cooldown timers
- **Kill score** and game timer displayed in the title bar

### 📈 Performance Stats (Web Dashboard)
- **Personal stats dashboard** powered by Riot API — rank, LP, win rate, champion pool
- **LP progress chart** — interactive graph tracking Solo/Duo and Flex LP over 7d/30d
- **Match history** with expandable scoreboards, per-game DPM bars, and KP stats
- **AI performance analysis** — queue health, consistency grade, mental state, improvement areas
- **Per-champion ratings** with AI-generated grades and notes
- **Mode filtering** — filter by Ranked, Flex, ARAM, Draft, or Normal
- **Player profile lookup** — click any player name in match history to view their stats
- **LP prediction** — estimated games to promotion based on current win rate

### 🌐 Web Portal
- **Champion encyclopedia** — browse all champions with DDragon data, runes, items, and spells
- **Champion-specific pages** — detailed stats, recommended builds, and matchup information
- **Match details** — detailed breakdown of any match via match ID
- **Leaderboards** — regional rankings by rank, LP, and win rate

### 💰 Billing System
- **Usage tracking** — track API calls, AI generations, and feature usage
- **Usage dashboard** — visualize usage patterns over time
- **Pricing tiers** — manage different pricing plans and limits

### 🔄 Live Advisor (Mid-Game)
- **Real-time build adaptation** during the game via Gemini Flash
- Monitors enemy items, KDA, and gold to suggest build pivots
- Identifies **fed threats** and recommends counters
- Suggests **next purchase** based on current game state, not just the pre-game plan

### 📦 In-Game Item Set & Rune Export
- **One-click item set export** — writes directly to League's item sets folder
- Auto-detects League install path across common locations
- **Rune page auto-import** via LCU API — creates/updates a DraftCoach rune page directly in the client

### 🔌 League Client Integration (LCU)
- **WebSocket connection** to the League Client for instant champ select updates
- **Exponential backoff reconnect** (0.5s → 8s max) with polling fallback
- **Status indicator** — connected / disconnected / reconnecting
- Auto-detects lockfile from common installation paths

### 🗃️ Knowledge Base System
- **Structured KB** with champion data, build templates, matchups, synergies, and scoring weights
- **Hot-reload** — file watcher auto-reloads KB when JSON files change
- **Atomic updates** with archive and rollback support for patch transitions
- **Validation pipeline** — validates all KB files before loading with detailed error reporting
- **Meta-builder CLI** — generates champion/item data from DDragon + CommunityDragon

---

## Architecture

```
DraftCoach/
├── apps/
│   ├── backend/                   # Express API server
│   │   └── src/
│   │       ├── index.ts           # Main server entry
│   │       ├── routes/            # API endpoints
│   │       │   ├── build.ts       # Build generation
│   │       │   ├── billing.ts     # Usage tracking
│   │       │   └── ...
│   │       ├── services/          # Business logic
│   │       │   ├── gemini.ts      # AI integration
│   │       │   └── rag-updater.ts # Knowledge base updates
│   │       └── models/            # Data models
│   │
│   ├── web/                       # Next.js web portal
│   │   └── src/app/
│   │       ├── page.tsx           # Home / search
│   │       ├── summoner/[region]/[name]/  # Player stats
│   │       ├── champions/[championId]/     # Champion pages
│   │       ├── match/[region]/[matchId]/  # Match details
│   │       └── leaderboards/      # Regional leaderboards
│   │
│   ├── billing/                   # Usage tracking dashboard
│   │   └── src/
│   │       ├── index.ts           # Billing API
│   │       ├── dashboard.html     # Usage visualization
│   │       ├── routes/usage.ts    # Usage endpoints
│   │       └── services/
│   │           ├── pricing.ts    # Pricing logic
│   │           └── tracker.ts     # Usage tracking
│   │
│   ├── desktop-tauri/             # Tauri v2 Desktop App
│   │   ├── src-tauri/             # Rust backend
│   │   │   ├── src/lib.rs         # Main Tauri setup
│   │   │   ├── tauri.conf.json    # Tauri config
│   │   │   └── target/            # Build output
│   │   └── src/                   # React frontend
│   │       ├── App.tsx            # Main app
│   │       ├── Overlay.tsx        # In-game overlay
│   │       ├── SplashScreen.tsx   # Startup splash
│   │       ├── ScoreboardWindow.tsx
│   │       ├── ScoutWindow.tsx
│   │       ├── StatsWindow.tsx
│   │       ├── TrackerPanel.tsx
│   │       ├── hooks/             # React hooks
│   │       │   ├── useBuildHistory.ts
│   │       │   ├── useLCUPolling.ts
│   │       │   ├── useLiveAdvisor.ts
│   │       │   └── useSettings.ts
│   │       └── bridge.ts          # Tauri IPC bridge
│   │
│   ├── installer/                 # Custom Rust installer
│   │   ├── src/main.rs            # Installer logic
│   │   └── ui/                    # Installer UI
│   │
│   └── desktop/                   # Legacy Electron (deprecated)
│
├── shared/                        # Shared TypeScript modules
│   ├── engine/                    # Local decision engine (<30ms)
│   ├── kb/                        # Knowledge Base system
│   ├── lcu/                       # League Client WebSocket adapter
│   ├── export/                    # Rune page LCU export
│   └── types.ts                   # Shared types
│
├── tools/
│   └── meta-builder/              # KB builder CLI
│
└── nsis/                         # NSIS installer scripts
```

**Production:** The Tauri Rust backend automatically launches the Node.js backend on startup. The backend runs an Express server on `http://127.0.0.1:3210`.

**Development:**
```bash
# Start all services
npm run dev:all

# Or start individual services
npm run dev:backend    # API server
npm run dev:billing    # Billing dashboard
npm run dev:web        # Next.js web portal

# Start Tauri desktop app
cd apps/desktop-tauri
npm run tauri dev
```

---

## Build Sections

Each generated build includes:

| Section | Description |
|---------|-------------|
| **Runes** | Primary tree + keystone, secondary tree, stat shards — with icons |
| **Summoner Spells** | Optimal spells for role and matchup |
| **Skill Order** | Priority leveling (e.g. R > Q > W > E) |
| **Starting Items** | Opening purchase with reasoning |
| **Core Build** | 6-7 items with explanations |
| **Situational Items** | 4+ conditional swaps with buy conditions |
| **Jungle Path** | Optimized clear route for junglers (displayed on minimap overlay) |

---

## Setup

### Prerequisites

- **Node.js** 18+
- **Rust** (for Tauri builds)
- **Gemini API Key** with Google Search grounding enabled ([Get one here](https://aistudio.google.com/))

### Installation

```bash
git clone https://github.com/Sliv3er/DraftCoach.git
cd DraftCoach
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```bash
GEMINI_API_KEY=your_api_key_here
BACKEND_PORT=3210
```

### Development

```bash
# Start all services (backend + billing + web)
npm run dev:all

# Start desktop app (requires backend running)
cd apps/desktop-tauri
npm run tauri dev
```

### Production Build

```bash
# Build Tauri desktop app + NSIS Installer
cd apps/desktop-tauri
npm run tauri build

# Output: apps/desktop-tauri/src-tauri/target/release/bundle/nsis/DraftCoach_<version>_x64-setup.exe
```

### Running Tests

```bash
# Run all tests
npm test

# Run engine-only tests
npm run test:engine

# Validate Knowledge Base
npm run validate:kb
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri v2 (Rust) |
| Frontend | React 18 + TypeScript + Vite |
| Web Portal | Next.js 14 (App Router) |
| Backend | Node.js + Express |
| Billing | Express + Usage Tracking |
| AI (Builds) | Google Gemini 3.1 Pro with Search Grounding |
| AI (Live) | Google Gemini 3 Flash (real-time advisor) |
| Local Engine | Custom rules-based scoring engine (<30ms) |
| Build | Tauri CLI + NSIS |
| Data | Riot DDragon CDN + CommunityDragon |
| Client API | League Client Update (LCU) WebSocket |
| Game API | Riot Live Client Data API |
| Testing | Jest + ts-jest |

---

## Roadmap

- [x] Auto-detect champ select via League Client API (LCU)
- [x] Rune page auto-import
- [x] In-game overlay
- [x] Live cooldown tracking
- [x] Player scouting
- [x] Performance stats dashboard
- [x] Local decision engine
- [x] Live build advisor
- [x] App icon and installer
- [x] Web portal with champion pages and leaderboards
- [x] Usage tracking and billing system
- [x] **Migrated from Electron to Tauri v2 (97% smaller installer, 74MB -> 2MB)**
- [ ] Match history analysis with AI coaching
- [ ] Multi-language support
- [ ] macOS / Linux builds
- [ ] Tauri Auto-updater setup

---

## License

MIT

---

<p align="center">
  <sub>Built with Gemini AI • Not endorsed by Riot Games • League of Legends is a trademark of Riot Games, Inc.</sub>
</p>