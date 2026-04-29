# Future: Centralized RAG & Meta Build Server

> **Status**: Future implementation — save for production phase  
> **Priority**: High (required before public release)

## Problem

Currently every client runs its own Gemini grounding calls to build the RAG/meta cache. This means:
- Every user burns their own API key (or ours) for ~41 calls per patch
- 1000 users = 41,000 redundant identical API calls
- Inconsistent data across users (Gemini is non-deterministic)
- No quality control — bad data reaches users unchecked
- Thundering herd on patch day (all clients sync simultaneously)

## Solution: Server-Side Sync + Static CDN

### Architecture

```
You (Server) ─── Cron on patch day ───→ Gemini + Google Search Grounding
                                              │
                                              ▼
                                        Validate & QA
                                              │
                                              ▼
                                     Publish static JSON files
                                              │
                                              ▼
                                     CDN (GitHub Pages / Cloudflare)
                                              │
                                              ▼
                                     All clients fetch via HTTP
```

### API Design

```
Base URL: https://api.draftcoach.gg/meta/v1/

Endpoints (all static JSON files):
  GET /manifest.json                    ← patch version, file list, checksums
  GET /patch-notes/{patch}.json         ← meta context, champion changes
  GET /sr/{patch}/{Champion}_{Role}.json      ← SR meta build
  GET /aram/{patch}/{Champion}.json           ← ARAM meta build  
  GET /aram-mayhem/{patch}/{Champion}.json    ← ARAM Mayhem build + augments
  GET /starting-items/{patch}.json      ← valid starting items per role
  GET /items/{patch}/sr.json            ← SR item pool
  GET /items/{patch}/aram.json          ← ARAM item pool
```

### Hosting Options (cheapest first)

1. **GitHub Pages** — $0. Push JSON files to a repo, served via CDN. Perfect for static data that changes every 2 weeks.
2. **Cloudflare Pages + R2** — Free tier covers millions of requests. More flexibility.
3. **Vercel / Netlify** — Free tier, auto-deploy from Git.
4. **VPS (Hetzner/OVH)** — €4/mo if you want cron + API on same box.

### Client-Side Dual-Mode

```js
// Production: fetch from centralized server
const META_API = 'https://api.draftcoach.gg/meta/v1';

async function getMetaBuild(champion, role, mode, patch) {
  // 1. Try remote server first
  try {
    const url = mode === 'sr' 
      ? `${META_API}/sr/${patch}/${champion}_${role}.json`
      : `${META_API}/${mode}/${patch}/${champion}.json`;
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch {}

  // 2. Fallback: local Gemini sync (dev mode / server down)
  return localFetchMetaBuild(champion, role, mode, patch);
}
```

### Server Cron Job (runs on patch day)

```
1. Detect new DDragon version
2. Run ~41 batched Gemini grounding calls (all champs × all modes)
3. Validate JSON output (schema check, item name validation)
4. Optional: manual QA review before publish
5. git commit + push to GitHub Pages repo (auto-deploys)
6. Clients pick up new data on next manifest check
```

### Benefits

- **$0 hosting cost** with GitHub Pages
- **One API call per patch** (manifest check) vs 41+ Gemini calls per client
- **Consistent data** — every user gets the exact same meta builds
- **Quality control** — you can review/fix data before it reaches users
- **Instant availability** — no 10-minute sync delay for new users
- **No user API key required** — removes the biggest UX friction point
