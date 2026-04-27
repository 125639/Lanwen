# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LinguaFlash is a mobile-first English flashcard PWA (React + TypeScript + Vite) with OCR + LLM integration for extracting words from images, Youdao Dictionary-style word cards, and SM-2 spaced repetition. The UI is in Chinese (zh-CN).

## Commands

```bash
npm run dev          # Runs Vite dev server (port 4173) + Express API proxy (port 8770) concurrently
npm run dev:web      # Vite dev server only
npm run dev:server   # Express API server only
npm run build        # tsc -b && vite build (output to dist/)
npm run lint         # ESLint
npm run serve        # Production: Express serves dist/ static files + API proxy
```

PM2 production config: `ecosystem.config.cjs`

## Architecture

### Frontend (src/)

Single-page React app with tab-based navigation managed in `App.tsx`. No router library — tabs are `cards | learn | en2zh | zh2en | library` with animated page transitions (350ms).

- **App.tsx** — Root orchestrator. Owns all top-level state (books, words, settings, stats, achievements). Child components receive data via props and callbacks.
- **db.ts** — Dexie.js wrapper over IndexedDB. All data operations go through exported functions here. DB has 3 schema versions (v1-v3). All mutations use `db.transaction('rw', ...)`.
- **types.ts** — All TypeScript interfaces (`WordCard`, `Book`, `SM2CardRecord`, `AppSettings`, etc.)
- **settings.ts** — `AppSettings` persistence via localStorage. Settings save instantly (no save button pattern).
- **sm2.ts** — SM-2 spaced repetition algorithm. Grades 0-5: 0-2 = reset, 3 = hard, 4-5 = good/easy.
- **api.ts / apiBase.ts** — Client-side API calls to the Express proxy.
- **tts.ts** — Text-to-speech (browser API or OpenAI TTS via proxy).
- **achievements.ts** — Achievement definitions and unlock logic.

### Backend (server/index.js)

Single Express server (plain JS, not TypeScript) acting as an API proxy to external services. Endpoints:

- `POST /api/ocr/extract` — Image to text. Tries DeepSeek legacy OCR first, falls back to chat-based vision.
- `POST /api/llm/extract` — OCR text to structured word data. Always uses SSE streaming internally; parses JSON word objects from LLM output.
- `POST /api/llm/lookup` — Single word dictionary lookup via LLM.
- `POST /api/tts/speak` — TTS audio proxy (OpenAI-compatible).
- `POST /api/llm/test` / `POST /api/ocr/test` — Connection test endpoints.
- `GET /api/health` — Health check.

The server blocks requests to private/internal URLs via `isAllowedUrl()`. In production, it serves `dist/` static files with SPA fallback.

### Data Flow

- Persistent data: IndexedDB via Dexie.js (`db.ts`)
- Settings: localStorage (`settings.ts`)
- API calls: Browser -> Express proxy (port 8770) -> External OCR/LLM/TTS APIs
- In dev, Vite proxies `/api` requests to port 8770

### Key Patterns

- **Word normalization**: All words are lowercased and trimmed before storage (`normalizeWord()` in db.ts). Duplicate detection uses compound index `[bookId+word]`.
- **LLM temperature auto-detection**: Moonshot/Kimi models get `temperature=1`; others default to `0.2`. Client-provided temperature overrides both.
- **LLM response parsing**: The server attempts `JSON.parse` first, then falls back to `extractJsonObjects()` which finds balanced-brace JSON objects in malformed output.
- **Soft delete**: Words can be soft-deleted (`deleted: true`) for learn mode; `getWordsByBook` excludes deleted words by default.

### Design System (index.css)

- Mobile-first: base 390px width (iPhone 14), max-width 480px
- Glassmorphism: TopNav blur(12px), BottomNav blur(16px)
- Dark mode: `data-theme="dark"` attribute on root
- Required animation timing: 350ms page transitions, 300ms card flip, `cubic-bezier(0.34, 1.56, 0.64, 1)` spring easing

## IndexedDB Schema (v3)

```
books:          &id, name, wordCount, createdAt, updatedAt
words:          ++id, bookId, word, pos, createdAt, updatedAt, [bookId+word]
reviewLogs:     ++id, wordId, bookId, result, mode, timestamp
sm2Cards:       &wordId, bookId, nextReviewAt, masteryLevel, updatedAt
dailyStats:     &dateKey, updatedAt
achievements:   &id, unlockedAt
learnSessions:  ++id, bookId, startedAt
wordStatuses:   [wordId+bookId], bookId, state
```

## Environment Variables (Server)

```
PORT=8770          # API server port (default 8770)
AUTH_TOKEN=xxx     # Optional token auth for /api routes
```

## Testing

No automated test suite. Manual testing checklist:
1. Upload flow: File -> OCR -> Edit -> AI Extract -> Save
2. Test modes: EN->ZH and ZH->EN with grade buttons
3. Card swipe on mobile (touch) and desktop (mouse drag)
4. Dark mode toggle
5. Settings persistence across reloads
