# Lanwen - Agent Guide

A mobile-first English flashcard app with OCR + LLM integration, Youdao Dictionary-style word cards, and SM2 spaced repetition.

## Architecture

```
english/
├── src/
│   ├── App.tsx              # Main app shell, tab routing, state orchestration
│   ├── db.ts                # Dexie.js IndexedDB layer, all data operations
│   ├── types.ts             # TypeScript interfaces (WordCard, Book, etc.)
│   ├── settings.ts          # localStorage settings persistence
│   ├── sm2.ts               # SM-2 algorithm implementation
│   ├── api.ts               # OCR/LLM API client
│   ├── index.css            # Design tokens, animations, Youdao-style card styles
│   └── components/
│       ├── CardsPage.tsx    # Flashcard view with swipe gestures
│       ├── TestModePage.tsx # EN→ZH / ZH→EN test modes
│       ├── LibraryPage.tsx  # Word library with FAB upload
│       ├── WordCard.tsx     # Youdao Dictionary 7-section card
│       └── SettingsPanel.tsx # Settings with instant persistence
└── server/
    └── index.js             # Express proxy for OCR (/api/ocr/extract) + LLM (/api/llm/extract)
```

**Data Flow:**
- All persistent data → IndexedDB (Dexie.js) - `db.ts`
- Settings only → localStorage - `settings.ts`
- API calls → Local Express proxy (port 8770) → External OCR/LLM APIs

## Commands

```bash
# Dev (runs both Vite dev server + Express API proxy)
npm run dev

# Build for production
npm run build

# Serve production build with API proxy
npm run serve

# Lint only
npm run lint
```

**Port Mapping:**
- Vite dev: 4173 (with `/api` proxy to 8770)
- Express API: 8770

## Key Implementation Details

### Design System (index.css)
- **Mobile-first**: Base 390px width (iPhone 14), max-width 480px
- **Youdao-style cards**: 7 sections - Word, Phonetic, POS+Meaning, Collins, Examples, Mnemonic, Tags
- **Mandatory animations**: 350ms page transitions, 300ms card flip, `cubic-bezier(0.34, 1.56, 0.64, 1)` spring
- **Glassmorphism**: TopNav blur(12px), BottomNav blur(16px)
- **Dark mode**: `data-theme="dark"` attribute selector

### IndexedDB Schema (db.ts)
```typescript
books: '&id, name, wordCount, createdAt, updatedAt'
words: '++id, bookId, word, pos, createdAt, updatedAt, [bookId+word]'
reviewLogs: '++id, wordId, bookId, result, mode, timestamp'
sm2Cards: '&wordId, bookId, nextReviewAt, masteryLevel, updatedAt'
dailyStats: '&dateKey, updatedAt'
achievements: '&id, unlockedAt'
```

**Important:** All DB operations use `db.transaction('rw', ...)` for consistency.

### Touch Gestures (CardsPage.tsx)
- Real-time finger following with `transform: translateX(${deltaX}px) rotate(${rotation}deg)`
- Velocity detection: SWIPE_THRESHOLD=50px, SWIPE_VELOCITY=0.3px/ms
- Spring bounce-back on cancel via CSS transition

### API Proxy (server/index.js)
- `/api/ocr/extract` - Image → text (DeepSeek or generic vision models)
- `/api/llm/extract` - OCR text → structured word data (streaming SSE)
- `/api/llm/lookup` - Single word lookup
- Auto-detects temperature for moonshotai/kimi models (requires temp=1)

### Settings Pattern
Settings save **instantly** to localStorage (no save button). All components read from the single `settings` state in App.tsx.

```typescript
// In settings.ts
export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const next = { ...current, ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}
```

### Spaced Repetition (sm2.ts)
Implements SM-2 algorithm with grades 0-5:
- Grade 0-2: "Again" - resets interval, increases wrongCount
- Grade 3: "Hard" - minimal interval increase
- Grade 4-5: "Good/Easy" - normal interval progression

## Common Tasks

### Adding a new word field
1. Update `WordCard` interface in `types.ts`
2. Update LLM prompt in `server/index.js` `buildPrompt()`
3. Update UI in `WordCard.tsx`
4. Run `npm run build` and test upload flow

### Adding a new API endpoint
1. Add route handler in `server/index.js`
2. Add client function in `src/api.ts`
3. Update Vite proxy config if needed

### Debugging IndexedDB
```typescript
// In browser console
const { db } = await import('./src/db.ts');
await db.words.toArray();  // List all words
await db.sm2Cards.toArray(); // List all SM2 records
```

## Testing Checklist (Manual)

Before committing:
1. Upload flow works: File → OCR → Edit → AI Extract → Save
2. Test mode completes: EN→ZH and ZH→EN with grade buttons
3. Card swipe navigation works on mobile (touch) and desktop (mouse drag)
4. Dark mode toggle applies instantly
5. Settings persist across reloads
6. Duplicate detection works in upload flow

## Build Output

Production build goes to `dist/`:
- Static files served by Express in production
- PWA manifest configured in `vite.config.ts`
- Icons in `public/` (icon-192.png, icon-512.png)

## Environment Variables (Server)

```bash
PORT=8770              # API server port
AUTH_TOKEN=xxx         # Optional token auth for API
```

No `.env` file committed - set manually in production.
