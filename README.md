# Lanwen (琅文)

Mobile-first English flashcard app with OCR + LLM integration, Youdao Dictionary-style word cards, and SM-2 spaced repetition.

## Features

- **OCR Upload** — Snap a photo of unfamiliar words from books, papers, or screens; the app extracts text via vision API
- **AI Word Extraction** — Extracted text is parsed by LLM into structured dictionary entries (phonetics, definitions, examples, mnemonics, collocations)
- **Youdao-style Cards** — 7-section word cards: word, phonetic, POS + definition, Collins rating, examples, mnemonic, tags
- **SM-2 Spaced Repetition** — Industry-standard algorithm for optimal review scheduling
- **Two Test Modes** — EN→ZH (recognition) and ZH→EN (production)
- **Swipe Gestures** — Real-time finger-following card interactions with spring bounce-back
- **Dark Mode** — Glassmorphism UI with instant theme toggle
- **PWA Ready** — Installable on mobile devices
- **Achievements System** — Gamified learning milestones

## Tech Stack

| Layer     | Technology                                   |
| --------- | -------------------------------------------- |
| Frontend  | React 18, TypeScript, Vite, Dexie.js         |
| Backend   | Express 5 (API proxy)                        |
| Database  | IndexedDB (via Dexie.js)                     |
| AI        | DeepSeek / Kimi vision + text LLM            |

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server (Vite + Express proxy)
npm run dev
```

| Port | Service               |
| ---- | --------------------- |
| 4173 | Vite dev server       |
| 8770 | Express API proxy     |

## Production

```bash
# Build & serve
npm run build
npm run serve
```

### Docker

```bash
docker build -t lanwen .
docker run -d --name lanwen -p 8770:8770 lanwen
```

The image runs as a non-root `app` user and includes a healthcheck at `/api/health`.

#### Pull from Docker Hub

```bash
docker pull safg/lanwen:latest
docker run -d --name lanwen -p 8770:8770 safg/lanwen:latest
```

#### Deploy

```bash
docker run -d --name lanwen -p <HOST_PORT>:8770 -e AUTH_TOKEN=xxx safg/lanwen:latest
```

| Env         | Default | Description       |
| ----------- | ------- | ----------------- |
| `PORT`      | `8770`  | API server port   |
| `AUTH_TOKEN`| (none)  | Optional API auth |

### PM2

```bash
pm2 start ecosystem.config.cjs
```

## API Endpoints

| Endpoint            | Description                    |
| ------------------- | ------------------------------ |
| `/api/ocr/extract`  | Image → text via vision model  |
| `/api/llm/extract`  | OCR text → structured word data (SSE stream) |
| `/api/llm/lookup`   | Single word dictionary lookup  |

## Project Structure

```
src/
├── App.tsx               # App shell, tab routing, state orchestration
├── db.ts                 # Dexie.js IndexedDB layer
├── types.ts              # TypeScript interfaces (WordCard, Book, etc.)
├── settings.ts           # localStorage settings persistence
├── sm2.ts                # SM-2 algorithm implementation
├── api.ts                # OCR/LLM API client
├── index.css             # Design tokens, animations, card styles
└── components/
    ├── CardsPage.tsx      # Flashcard view with swipe gestures
    ├── TestModePage.tsx   # EN→ZH / ZH→EN test modes
    ├── LibraryPage.tsx    # Word library with FAB upload
    ├── WordCard.tsx       # Youdao Dictionary 7-section card
    └── SettingsPanel.tsx  # Settings with instant persistence
server/
└── index.js              # Express proxy for OCR + LLM APIs
```

## Environment Variables

| Variable     | Default | Description          |
| ------------ | ------- | -------------------- |
| `PORT`       | `8770`  | API server port      |
| `HOST`       | (none)  | Bind address         |
| `AUTH_TOKEN` | (none)  | Optional API auth    |

## License

MIT
