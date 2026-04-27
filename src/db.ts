import Dexie, { type Table } from 'dexie';
import type {
  AchievementRecord,
  Book,
  ChatMessage,
  DailyStatsRecord,
  LearnSession,
  ReviewLog,
  ReviewSourceMode,
  ReviewWrongReason,
  SM2CardRecord,
  TodayTaskSummary,
  WordCard,
  WordStatus,
} from './types';
import { createSM2Card, getDueCards, sm2Update, type SM2Grade } from './sm2';

class LinguaFlashDB extends Dexie {
  books!: Table<Book, string>;
  words!: Table<WordCard, number>;
  reviewLogs!: Table<ReviewLog, number>;
  sm2Cards!: Table<SM2CardRecord, number>;
  dailyStats!: Table<DailyStatsRecord, string>;
  achievements!: Table<AchievementRecord, string>;
  learnSessions!: Table<LearnSession, number>;
  wordStatuses!: Table<WordStatus, [number, string]>;
  chatMessages!: Table<ChatMessage, number>;

  constructor() {
    super('linguaflash_db');
    this.version(1).stores({
      books: '&id, name, wordCount, createdAt, updatedAt',
      words: '++id, bookId, word, pos, createdAt, updatedAt, [bookId+word]',
      reviewLogs: '++id, wordId, bookId, result, mode, timestamp',
    });
    this.version(2).stores({
      books: '&id, name, wordCount, createdAt, updatedAt',
      words: '++id, bookId, word, pos, createdAt, updatedAt, [bookId+word]',
      reviewLogs: '++id, wordId, bookId, result, mode, timestamp',
      sm2Cards: '&wordId, bookId, nextReviewAt, masteryLevel, updatedAt',
      dailyStats: '&dateKey, updatedAt',
      achievements: '&id, unlockedAt',
    });
    this.version(3).stores({
      books: '&id, name, wordCount, createdAt, updatedAt',
      words: '++id, bookId, word, pos, createdAt, updatedAt, [bookId+word]',
      reviewLogs: '++id, wordId, bookId, result, mode, timestamp',
      sm2Cards: '&wordId, bookId, nextReviewAt, masteryLevel, updatedAt',
      dailyStats: '&dateKey, updatedAt',
      achievements: '&id, unlockedAt',
      learnSessions: '++id, bookId, startedAt',
      wordStatuses: '[wordId+bookId], bookId, state',
    });
    this.version(4).stores({
      books: '&id, name, wordCount, createdAt, updatedAt',
      words: '++id, bookId, word, pos, createdAt, updatedAt, [bookId+word]',
      reviewLogs: '++id, wordId, bookId, result, mode, timestamp',
      sm2Cards: '&wordId, bookId, nextReviewAt, masteryLevel, updatedAt',
      dailyStats: '&dateKey, updatedAt',
      achievements: '&id, unlockedAt',
      learnSessions: '++id, bookId, startedAt',
      wordStatuses: '[wordId+bookId], bookId, state',
      chatMessages: '++id, timestamp, role, wordId, bookId, [bookId+timestamp]',
    });
  }
}

export const db = new LinguaFlashDB();

function getDateKey(timestamp = Date.now()): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getStartOfDay(timestamp = Date.now()): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isNightSession(timestamp = Date.now()): boolean {
  const h = new Date(timestamp).getHours();
  return h < 5;
}

function safeRandomId(): string {
  const browserCrypto = globalThis.crypto;

  if (browserCrypto && typeof browserCrypto.randomUUID === 'function') {
    return browserCrypto.randomUUID();
  }

  if (browserCrypto && typeof browserCrypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    browserCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  const random = Math.random().toString(16).slice(2);
  return `fallback-${Date.now()}-${random}`;
}

function now(): number {
  return Date.now();
}

function isLearnedWordState(state: WordStatus['state']): boolean {
  return state === 'known' || state === 'unknown' || state === 'wrong';
}

function shouldCountAsNewLearning(
  existing: WordStatus | undefined,
  nextState: WordStatus['state'],
): boolean {
  return isLearnedWordState(nextState) && (!existing || existing.state === 'new' || existing.state === 'deleted');
}

async function incrementDailyNewLearning(timestamp = now()): Promise<void> {
  const dateKey = getDateKey(timestamp);
  const existingDaily = await db.dailyStats.get(dateKey);
  const nightInc = isNightSession(timestamp) ? 1 : 0;

  if (existingDaily) {
    await db.dailyStats.update(dateKey, {
      learned: existingDaily.learned + 1,
      newWordsDone: existingDaily.newWordsDone + 1,
      nightSessions: existingDaily.nightSessions + nightInc,
      updatedAt: now(),
    });
    return;
  }

  await db.dailyStats.put({
    dateKey,
    learned: 1,
    reviewed: 0,
    newWordsDone: 1,
    reviewDone: 0,
    perfectDay: 0,
    fastAnswers: 0,
    nightSessions: nightInc,
    updatedAt: now(),
    createdAt: now(),
  });
}

function inferWrongReasonFromMode(mode: ReviewLog['mode']): ReviewWrongReason {
  return mode === 'zh2en' ? 'spelling' : 'meaning';
}

function getLevelPriorityWeight(levelTags: string[] | undefined): number {
  if (!levelTags?.length) {
    return 0;
  }

  return levelTags.reduce((weight, tag) => {
    if (tag === '考研') return weight + 1.25;
    if (tag === '雅思' || tag === '托福') return weight + 1.15;
    if (tag === 'CET6') return weight + 1;
    if (tag === 'CET4') return weight + 0.6;
    return weight + 0.35;
  }, 0);
}

function getSuggestedTaskAction(counts: {
  newCount: number;
  reviewCount: number;
  weakCount: number;
  outputCount: number;
}): TodayTaskSummary['suggestedAction'] {
  if (counts.reviewCount > 0) return 'review';
  if (counts.weakCount > 0) return 'weak';
  if (counts.newCount > 0) return 'learn';
  if (counts.outputCount > 0) return 'output';
  return 'done';
}

function buildTaskCopy(action: TodayTaskSummary['suggestedAction']): Pick<TodayTaskSummary, 'headline' | 'subline'> {
  if (action === 'review') {
    return {
      headline: '优先完成到期复习',
      subline: '先处理高风险单词，再回头推进新词学习，记忆收益最高。',
    };
  }

  if (action === 'weak') {
    return {
      headline: '今天先清理错词',
      subline: '错词命中率最高，先补薄弱点能明显提升后续测试体验。',
    };
  }

  if (action === 'learn') {
    return {
      headline: '可以开始新词学习了',
      subline: '新词队列已准备好，建议先过一组，再进入测试或复习。',
    };
  }

  if (action === 'output') {
    return {
      headline: '安排一轮输出练习',
      subline: '把容易拼写或用法出错的词转成主动输出，记忆更牢。',
    };
  }

  return {
    headline: '今日任务已清空',
    subline: '可以自由浏览卡片，或从阅读关键词里继续补充新词。',
  };
}

async function syncWordStatusFromReview(review: Omit<ReviewLog, 'id'>): Promise<void> {
  const existing = await db.wordStatuses.get([review.wordId, review.bookId]);
  if (existing?.state === 'deleted') {
    return;
  }

  const isFailed = review.result === 'hard' || (review.grade ?? 5) < 3;
  const timestamp = review.timestamp ?? now();
  const wrongReason = review.wrongReason ?? inferWrongReasonFromMode(review.mode);

  await db.wordStatuses.put({
    wordId: review.wordId,
    bookId: review.bookId,
    state: isFailed ? 'wrong' : 'known',
    learnedAt: existing?.learnedAt ?? timestamp,
    testedAt: timestamp,
    testPassed: !isFailed,
    wrongReason: isFailed ? wrongReason : existing?.wrongReason,
    consecutiveWrongCount: isFailed ? (existing?.consecutiveWrongCount ?? 0) + 1 : 0,
    lastReviewedAt: timestamp,
  });

  if (shouldCountAsNewLearning(existing, isFailed ? 'wrong' : 'known')) {
    await incrementDailyNewLearning(timestamp);
  }
}

async function updateBookWordCount(bookId: string): Promise<void> {
  const count = await db.words
    .where('bookId')
    .equals(bookId)
    .and((word) => !word.deleted)
    .count();

  await db.books.update(bookId, {
    wordCount: count,
    updatedAt: now(),
  });
}

function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

function createSampleWords(bookId: string): WordCard[] {
  const time = now();
  return [
    {
      bookId,
      word: 'dispatch',
      phonetic_uk: '/dɪˈspætʃ/',
      phonetic_us: '/dɪˈspætʃ/',
      pos: 'v./n.',
      meaning_brief: 'v. 派遣；发送 n. 急件；派遣',
      meaning_collins:
        'If you dispatch someone to a place, you send them there for a particular reason.',
      meaning_advanced: [
        {
          def: 'to send someone or something to a place for a particular purpose',
          example: 'Troops were dispatched to the flooded area.',
        },
      ],
      word_forms: {
        third_singular: 'dispatches',
        past_tense: 'dispatched',
        present_participle: 'dispatching',
      },
      level_tag: ['CET6', '考研'],
      origin_sentence: 'We have 125 cases ready for dispatch.',
      origin_translation: '我们有 125 个待发送的箱子。',
      ai_example_en: 'The manager dispatched a team to handle the emergency.',
      ai_example_zh: '经理派遣了一支团队去处理紧急情况。',
      mnemonic: 'dis（分散）+ patch（补丁）-> 分散派出去 -> 派遣',
      favorited: false,
      createdAt: time,
      updatedAt: time,
    },
    {
      bookId,
      word: 'meticulous',
      phonetic_uk: '/məˈtɪkjələs/',
      phonetic_us: '/məˈtɪkjələs/',
      pos: 'adj.',
      meaning_brief: 'adj. 一丝不苟的；极其认真的',
      meaning_collins:
        'Someone who is meticulous pays extreme attention to detail and is very careful.',
      meaning_advanced: [
        {
          def: 'very careful and precise, especially about small details',
          example: 'She keeps meticulous records of every experiment.',
        },
      ],
      word_forms: {},
      level_tag: ['CET6', '雅思'],
      origin_sentence: 'The editor was meticulous about punctuation.',
      origin_translation: '那位编辑对标点非常严谨。',
      ai_example_en: 'A meticulous plan can save time in complex projects.',
      ai_example_zh: '一份细致的计划能在复杂项目中节省时间。',
      mnemonic: 'meta（超越）+ cul（关心）-> 过度关心细节 -> 一丝不苟',
      favorited: true,
      createdAt: time,
      updatedAt: time,
    },
    {
      bookId,
      word: 'allocate',
      phonetic_uk: '/ˈæləkeɪt/',
      phonetic_us: '/ˈæləkeɪt/',
      pos: 'v.',
      meaning_brief: 'v. 分配；拨给',
      meaning_collins: 'If you allocate something, you give it to a particular person or purpose.',
      meaning_advanced: [
        {
          def: 'to give something officially to someone or for a specific purpose',
          example: 'The committee allocated extra funds to the school.',
        },
      ],
      word_forms: {
        third_singular: 'allocates',
        past_tense: 'allocated',
        present_participle: 'allocating',
      },
      level_tag: ['CET4', '托福'],
      origin_sentence: 'Each team was allocated a separate room.',
      origin_translation: '每个团队都被分配了独立房间。',
      ai_example_en: 'We need to allocate enough time for testing.',
      ai_example_zh: '我们需要分配足够的时间用于测试。',
      mnemonic: 'al（去）+ loc（地方）+ ate（动词）-> 放到某处 -> 分配',
      favorited: false,
      createdAt: time,
      updatedAt: time,
    },
    {
      bookId,
      word: 'inevitable',
      phonetic_uk: '/ɪnˈevɪtəbl/',
      phonetic_us: '/ɪnˈevɪtəbl/',
      pos: 'adj.',
      meaning_brief: 'adj. 不可避免的',
      meaning_collins:
        'If something is inevitable, it is certain to happen and cannot be prevented.',
      meaning_advanced: [
        {
          def: 'certain to happen and impossible to avoid',
          example: 'With such high costs, delays were inevitable.',
        },
      ],
      word_forms: {},
      level_tag: ['CET6', '考研', '雅思'],
      origin_sentence: 'Change is inevitable in modern technology.',
      origin_translation: '在现代科技中，变化不可避免。',
      ai_example_en: 'Some level of risk is inevitable in innovation.',
      ai_example_zh: '创新中某种程度的风险是不可避免的。',
      mnemonic: 'in（不）+ evitable（可避免）-> 不可避免',
      favorited: false,
      createdAt: time,
      updatedAt: time,
    },
    {
      bookId,
      word: 'coherent',
      phonetic_uk: '/kəʊˈhɪərənt/',
      phonetic_us: '/koʊˈhɪrənt/',
      pos: 'adj.',
      meaning_brief: 'adj. 连贯的；有条理的',
      meaning_collins:
        'If an argument or explanation is coherent, it is clear and logical and all parts fit well.',
      meaning_advanced: [
        {
          def: 'logical, clear, and well organized',
          example: 'Her talk was concise and coherent from start to finish.',
        },
      ],
      word_forms: {},
      level_tag: ['CET4', 'CET6'],
      origin_sentence: 'Try to write a coherent paragraph in your essay.',
      origin_translation: '试着在你的文章中写出连贯的段落。',
      ai_example_en: 'A coherent strategy helps teams move in the same direction.',
      ai_example_zh: '连贯的策略能帮助团队朝同一方向前进。',
      mnemonic: 'co（共同）+ here（粘连）-> 粘在一起 -> 连贯',
      favorited: false,
      createdAt: time,
      updatedAt: time,
    },
  ];
}

export async function ensureSeedData(): Promise<void> {
  const existing = await db.books.count();
  if (existing > 0) {
    return;
  }

  const timestamp = now();
  const sampleBook: Book = {
    id: safeRandomId(),
    name: 'Sample Unit',
    wordCount: 5,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const words = createSampleWords(sampleBook.id);

  await db.transaction('rw', db.books, db.words, db.sm2Cards, async () => {
    await db.books.add(sampleBook);
    const ids = await db.words.bulkAdd(words, { allKeys: true });
    for (const id of ids) {
      if (typeof id !== 'number') continue;
      await db.sm2Cards.put({
        ...createSM2Card(id),
        wordId: id,
        bookId: sampleBook.id,
        wrongCount: 0,
        updatedAt: now(),
        createdAt: now(),
      });
    }
  });
}

export async function getBooks(): Promise<Book[]> {
  return db.books.orderBy('updatedAt').reverse().toArray();
}

export async function getWordsByBook(bookId: string, includeDeleted = false): Promise<WordCard[]> {
  let query = db.words.where('bookId').equals(bookId);

  if (!includeDeleted) {
    query = query.and((w) => !w.deleted);
  }

  const rows = await query.sortBy('word');
  const ids = rows.map((item) => item.id).filter((id): id is number => typeof id === 'number');
  const cards = ids.length ? await db.sm2Cards.bulkGet(ids) : [];
  const cardMap = new Map<number, SM2CardRecord>();
  cards.forEach((card) => {
    if (card) {
      cardMap.set(card.wordId, card);
    }
  });

  return rows.map((row) => {
    const id = row.id;
    if (!id) {
      return row;
    }
    const card = cardMap.get(id);
    if (!card) {
      return row;
    }
    return {
      ...row,
      masteryLevel: card.masteryLevel,
      nextReviewAt: card.nextReviewAt,
      easeFactor: card.easeFactor,
      wrongCount: card.wrongCount,
    };
  });
}

export async function searchWords(bookId: string, query: string): Promise<WordCard[]> {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const words = await db.words.where('bookId').equals(bookId).toArray();
  return words
    .filter((item) => item.word.toLowerCase().includes(q) || item.meaning_brief.toLowerCase().includes(q))
    .sort((a, b) => a.word.localeCompare(b.word))
    .slice(0, 6);
}

export async function updateWordFavorite(id: number, favorited: boolean): Promise<void> {
  await db.words.update(id, {
    favorited,
    updatedAt: now(),
  });
}

export async function addWordToBook(
  bookId: string,
  word: Omit<WordCard, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>,
  mode: 'skip' | 'overwrite' = 'skip',
): Promise<{ status: 'added' | 'overwritten' | 'skipped'; wordId?: number }> {
  const timestamp = now();
  const normalized = normalizeWord(word.word);
  const existing = await db.words.where('[bookId+word]').equals([bookId, normalized]).first();

  if (existing?.id && mode === 'skip') {
    return { status: 'skipped', wordId: existing.id };
  }

  const payload: WordCard = {
    ...word,
    word: normalized,
    bookId,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  let finalWordId: number;
  let status: 'added' | 'overwritten' = 'added';

  await db.transaction('rw', db.words, db.books, db.sm2Cards, async () => {
    if (existing?.id) {
      await db.words.put({
        ...payload,
        id: existing.id,
      });
      finalWordId = existing.id;
      status = 'overwritten';
    } else {
      finalWordId = await db.words.add(payload);
    }

    await db.sm2Cards.put({
      ...createSM2Card(finalWordId),
      wordId: finalWordId,
      bookId,
      wrongCount: 0,
      updatedAt: now(),
      createdAt: now(),
    });

    await updateBookWordCount(bookId);
  });

  return { status, wordId: finalWordId! };
}

export async function saveBookWithWords(
  bookName: string,
  words: Array<Omit<WordCard, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>>,
  duplicateStrategy: 'skip' | 'overwrite' = 'skip',
): Promise<{ bookId: string; savedCount: number; skippedCount: number; overwrittenCount: number }> {
  const timestamp = now();
  const bookId = safeRandomId();

  const book: Book = {
    id: bookId,
    name: bookName,
    wordCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  let savedCount = 0;
  let skippedCount = 0;
  let overwrittenCount = 0;
  const seenInBatch = new Set<string>();
  const affectedBookIds = new Set<string>([bookId]);

  // Pre-normalize all words to check for duplicates efficiently
  const normalizedWords = words.map((item) => normalizeWord(item.word));
  const uniqueNormalizedWords = [...new Set(normalizedWords)];

  await db.transaction('rw', db.books, db.words, db.sm2Cards, async () => {
    await db.books.add(book);

    // Optimized: Only check duplicates within the SAME book (not across all books)
    const existingWords = uniqueNormalizedWords.length > 0
      ? await db.words.where('[bookId+word]')
          .anyOf(uniqueNormalizedWords.map(w => [bookId, w]))
          .toArray()
      : [];
    const existingMap = new Map<string, WordCard>();
    for (const item of existingWords) {
      existingMap.set(normalizeWord(item.word), item);
    }

    for (const item of words) {
      const normalized = normalizeWord(item.word);

      if (seenInBatch.has(normalized)) {
        skippedCount++;
        continue;
      }

      seenInBatch.add(normalized);
      const duplicateGlobal = existingMap.get(normalized);

      if (duplicateGlobal && duplicateStrategy === 'skip') {
        skippedCount++;
        continue;
      }

      const payload: WordCard = {
        ...item,
        word: normalized,
        bookId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      if (duplicateGlobal && duplicateGlobal.id && duplicateStrategy === 'overwrite') {
        affectedBookIds.add(duplicateGlobal.bookId);
        await db.words.put({
          ...payload,
          id: duplicateGlobal.id,
          createdAt: duplicateGlobal.createdAt,
        });
        await db.sm2Cards.put({
          ...createSM2Card(duplicateGlobal.id),
          wordId: duplicateGlobal.id,
          bookId,
          wrongCount: 0,
          updatedAt: now(),
          createdAt: now(),
        });
        overwrittenCount++;
      } else {
        const newWordId = await db.words.add(payload);
        await db.sm2Cards.put({
          ...createSM2Card(newWordId),
          wordId: newWordId,
          bookId,
          wrongCount: 0,
          updatedAt: now(),
          createdAt: now(),
        });
      }

      savedCount++;
    }

    for (const targetBookId of affectedBookIds) {
      await updateBookWordCount(targetBookId);
    }

  });

  return { bookId, savedCount, skippedCount, overwrittenCount };
}

export async function deleteWord(wordId: number): Promise<void> {
  const row = await db.words.get(wordId);
  if (!row) {
    return;
  }

  await db.transaction(
    'rw',
    [
      db.words,
      db.books,
      db.sm2Cards,
      db.reviewLogs,
      db.wordStatuses,
      db.chatMessages,
    ],
    async () => {
      await db.words.delete(wordId);
      await db.sm2Cards.delete(wordId);
      await db.reviewLogs.where('wordId').equals(wordId).delete();
      await db.wordStatuses.filter((status) => status.wordId === wordId).delete();
      await db.chatMessages.where('wordId').equals(wordId).delete();
      await updateBookWordCount(row.bookId);
    },
  );
}

export async function updateWord(wordId: number, patch: Partial<WordCard>): Promise<void> {
  await db.words.update(wordId, {
    ...patch,
    updatedAt: now(),
  });
}

export interface ExportPayload {
  version: string;
  exportedAt: number;
  books: Book[];
  words: WordCard[];
  reviewLogs: ReviewLog[];
  sm2Cards?: SM2CardRecord[];
  dailyStats?: DailyStatsRecord[];
  achievements?: AchievementRecord[];
  learnSessions?: LearnSession[];
  wordStatuses?: WordStatus[];
  chatMessages?: ChatMessage[];
}

export async function exportDatabase(): Promise<ExportPayload> {
  const [books, words, reviewLogs, sm2Cards, dailyStats, achievements, learnSessions, wordStatuses, chatMessages] = await Promise.all([
    db.books.toArray(),
    db.words.toArray(),
    db.reviewLogs.toArray(),
    db.sm2Cards.toArray(),
    db.dailyStats.toArray(),
    db.achievements.toArray(),
    db.learnSessions.toArray(),
    db.wordStatuses.toArray(),
    db.chatMessages.toArray(),
  ]);

  return {
    version: '1.0.0',
    exportedAt: now(),
    books,
    words,
    reviewLogs,
    sm2Cards,
    dailyStats,
    achievements,
    learnSessions,
    wordStatuses,
    chatMessages,
  };
}

export async function importDatabase(payload: ExportPayload): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.books,
      db.words,
      db.reviewLogs,
      db.sm2Cards,
      db.dailyStats,
      db.achievements,
      db.learnSessions,
      db.wordStatuses,
      db.chatMessages,
    ],
    async () => {
    await db.books.clear();
    await db.words.clear();
    await db.reviewLogs.clear();
    await db.sm2Cards.clear();
    await db.dailyStats.clear();
    await db.achievements.clear();
    await db.learnSessions.clear();
    await db.wordStatuses.clear();
    await db.chatMessages.clear();

    if (payload.books.length) {
      await db.books.bulkAdd(payload.books);
    }
    if (payload.words.length) {
      await db.words.bulkAdd(payload.words);
    }
    if (payload.reviewLogs.length) {
      await db.reviewLogs.bulkAdd(payload.reviewLogs);
    }
    if (payload.sm2Cards?.length) {
      await db.sm2Cards.bulkAdd(payload.sm2Cards);
    }
    if (payload.dailyStats?.length) {
      await db.dailyStats.bulkAdd(payload.dailyStats);
    }
    if (payload.achievements?.length) {
      await db.achievements.bulkAdd(payload.achievements);
    }
    if (payload.learnSessions?.length) {
      await db.learnSessions.bulkAdd(payload.learnSessions);
    }
    if (payload.wordStatuses?.length) {
      await db.wordStatuses.bulkAdd(payload.wordStatuses);
    }
    if (payload.chatMessages?.length) {
      await db.chatMessages.bulkAdd(payload.chatMessages);
    }
    },
  );
}

export async function resetDatabase(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.books,
      db.words,
      db.reviewLogs,
      db.sm2Cards,
      db.dailyStats,
      db.achievements,
      db.learnSessions,
      db.wordStatuses,
      db.chatMessages,
    ],
    async () => {
      await db.books.clear();
      await db.words.clear();
      await db.reviewLogs.clear();
      await db.sm2Cards.clear();
      await db.dailyStats.clear();
      await db.achievements.clear();
      await db.learnSessions.clear();
      await db.wordStatuses.clear();
      await db.chatMessages.clear();
    },
  );
}

export async function getChatMessages(limit = 200): Promise<ChatMessage[]> {
  const normalizedLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  const rows = await db.chatMessages.orderBy('timestamp').reverse().limit(normalizedLimit).toArray();
  return rows.reverse();
}

export async function addChatMessage(
  message: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp?: number },
): Promise<number> {
  const payload: ChatMessage = {
    ...message,
    timestamp: message.timestamp ?? now(),
  };

  let createdId = 0;
  await db.transaction('rw', db.chatMessages, async () => {
    createdId = await db.chatMessages.add(payload);
  });
  return createdId;
}

export async function clearChatMessages(): Promise<void> {
  await db.transaction('rw', db.chatMessages, async () => {
    await db.chatMessages.clear();
  });
}

export async function logReview(
  review: Omit<ReviewLog, 'id'>,
  options: { syncStatus?: boolean } = {},
): Promise<void> {
  const payload: Omit<ReviewLog, 'id'> = {
    ...review,
    timestamp: review.timestamp ?? now(),
    wrongReason:
      review.result === 'hard'
        ? review.wrongReason ?? inferWrongReasonFromMode(review.mode)
        : review.wrongReason,
    sourceMode: review.sourceMode ?? 'test',
  };

  await db.transaction('rw', db.reviewLogs, db.wordStatuses, db.dailyStats, async () => {
    await db.reviewLogs.add(payload);
    if (options.syncStatus !== false) {
      await syncWordStatusFromReview(payload);
    }
  });
}

export async function ensureSM2CardsForBook(bookId: string): Promise<void> {
  const words = await db.words.where('bookId').equals(bookId).toArray();

  await db.transaction('rw', db.sm2Cards, async () => {
    for (const word of words) {
      if (!word.id) continue;
      const existing = await db.sm2Cards.get(word.id);
      if (!existing) {
        await db.sm2Cards.put({
          ...createSM2Card(word.id),
          wordId: word.id,
          bookId,
          wrongCount: 0,
          updatedAt: now(),
          createdAt: now(),
        });
      }
    }
  });
}

export async function getDueWordIdsByBook(bookId: string): Promise<number[]> {
  await ensureSM2CardsForBook(bookId);
  const cards = await db.sm2Cards.where('bookId').equals(bookId).toArray();
  const dueCards = getDueCards(cards);
  if (!dueCards.length) {
    return [];
  }

  const dueIds = dueCards.map((item) => item.wordId);
  const dueIdSet = new Set(dueIds);
  const [words, statusMap, recentLogs] = await Promise.all([
    db.words.bulkGet(dueIds),
    getWordStatusesForBook(bookId),
    db.reviewLogs
      .where('bookId')
      .equals(bookId)
      .and((log) => dueIdSet.has(log.wordId) && log.timestamp >= Date.now() - 14 * 86400000)
      .toArray(),
  ]);

  const wordMap = new Map<number, WordCard>();
  words.forEach((word) => {
    if (word?.id && !word.deleted) {
      wordMap.set(word.id, word);
    }
  });

  const recentLogsByWord = new Map<number, ReviewLog[]>();
  for (const log of recentLogs) {
    const list = recentLogsByWord.get(log.wordId) ?? [];
    list.push(log);
    recentLogsByWord.set(log.wordId, list);
  }

  return dueCards
    .filter((card) => wordMap.has(card.wordId))
    .sort((left, right) => {
      const leftWord = wordMap.get(left.wordId);
      const rightWord = wordMap.get(right.wordId);
      const leftStatus = statusMap.get(left.wordId);
      const rightStatus = statusMap.get(right.wordId);
      const leftLogs = (recentLogsByWord.get(left.wordId) ?? []).sort((a, b) => a.timestamp - b.timestamp);
      const rightLogs = (recentLogsByWord.get(right.wordId) ?? []).sort((a, b) => a.timestamp - b.timestamp);

      const getConsecutiveWrong = (logs: ReviewLog[]): number => {
        let streak = 0;
        for (let index = logs.length - 1; index >= 0; index -= 1) {
          const log = logs[index];
          if (log.result !== 'hard' && (log.grade ?? 5) >= 3) {
            break;
          }
          streak += 1;
        }
        return streak;
      };

      const getRecentWrongs = (logs: ReviewLog[]): number =>
        logs.filter((log) => log.result === 'hard' || (log.grade ?? 5) < 3).length;

      const score = (
        card: SM2CardRecord,
        word: WordCard | undefined,
        status: WordStatus | undefined,
        logs: ReviewLog[],
      ) => {
        const overdueHours = Math.max(0, (Date.now() - card.nextReviewAt) / 3600000);
        const recentWrongs = getRecentWrongs(logs);
        const consecutiveWrongs = Math.max(status?.consecutiveWrongCount ?? 0, getConsecutiveWrong(logs));
        const wrongReasonBoost =
          status?.wrongReason === 'spelling' || status?.wrongReason === 'usage' ? 1 : 0;

        return (
          overdueHours * 0.15 +
          card.wrongCount * 3 +
          recentWrongs * 2 +
          consecutiveWrongs * 1.5 +
          getLevelPriorityWeight(word?.level_tag) +
          (word?.favorited ? 0.75 : 0) +
          wrongReasonBoost
        );
      };

      const rightScore = score(right, rightWord, rightStatus, rightLogs);
      const leftScore = score(left, leftWord, leftStatus, leftLogs);

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return left.nextReviewAt - right.nextReviewAt;
    })
    .map((item) => item.wordId);
}

export async function getSM2Card(wordId: number): Promise<SM2CardRecord | undefined> {
  return db.sm2Cards.get(wordId);
}

export async function updateSM2CardByGrade(
  params: {
    wordId: number;
    bookId: string;
    grade: SM2Grade;
    responseTimeMs?: number;
    schedule?: {
      grade0Minutes: number;
      grade1Minutes: number;
      grade2Days: number;
      grade3Multiplier: number;
      grade4Multiplier: number;
      grade5Multiplier: number;
    };
  },
): Promise<SM2CardRecord> {
  const current = await db.sm2Cards.get(params.wordId);
  const base = current ?? {
    ...createSM2Card(params.wordId),
    wordId: params.wordId,
    bookId: params.bookId,
    wrongCount: 0,
    updatedAt: now(),
    createdAt: now(),
  };

  const updated = sm2Update(base, params.grade, params.schedule);
  const record: SM2CardRecord = {
    ...base,
    ...updated,
    bookId: params.bookId,
    wrongCount: params.grade < 3 ? base.wrongCount + 1 : base.wrongCount,
    updatedAt: now(),
  };

  await db.transaction('rw', db.sm2Cards, db.dailyStats, db.reviewLogs, async () => {
    await db.sm2Cards.put(record);

    const dateKey = getDateKey();
    const existing = await db.dailyStats.get(dateKey);
    const reviewedInc = 1;
    const reviewDoneInc = params.grade >= 3 ? 1 : 0;
    const fastInc = (params.responseTimeMs ?? Number.MAX_SAFE_INTEGER) <= 10000 ? 1 : 0;
    const nightInc = isNightSession() ? 1 : 0;

    if (existing) {
      const newReviewed = existing.reviewed + reviewedInc;
      const newReviewDone = existing.reviewDone + reviewDoneInc;
      // perfectDay = 1 if all reviews so far were correct (reviewDone === reviewed)
      const newPerfectDay = newReviewed > 0 && newReviewDone === newReviewed ? 1 : 0;

      await db.dailyStats.update(dateKey, {
        reviewed: newReviewed,
        reviewDone: newReviewDone,
        perfectDay: newPerfectDay,
        fastAnswers: existing.fastAnswers + fastInc,
        nightSessions: existing.nightSessions + nightInc,
        updatedAt: now(),
      });
    } else {
      // First review of the day - perfectDay = 1 if this review was correct
      const perfectDay = reviewDoneInc === 1 ? 1 : 0;
      await db.dailyStats.put({
        dateKey,
        learned: 0,
        reviewed: reviewedInc,
        newWordsDone: 0,
        reviewDone: reviewDoneInc,
        perfectDay,
        fastAnswers: fastInc,
        nightSessions: nightInc,
        updatedAt: now(),
        createdAt: now(),
      });
    }
  });

  return record;
}

export async function getSM2CardsByBook(bookId: string): Promise<SM2CardRecord[]> {
  await ensureSM2CardsForBook(bookId);
  return db.sm2Cards.where('bookId').equals(bookId).toArray();
}

function createEmptyDailyStatsRecord(dateKey: string): DailyStatsRecord {
  return {
    dateKey,
    learned: 0,
    reviewed: 0,
    newWordsDone: 0,
    reviewDone: 0,
    perfectDay: 0,
    fastAnswers: 0,
    nightSessions: 0,
    updatedAt: 0,
    createdAt: 0,
  };
}

export async function getCalendarStats(days = 84): Promise<Array<{ dateKey: string; count: number }>> {
  const rows = await db.dailyStats.toArray();
  const statsMap = new Map(rows.map((item) => [item.dateKey, item]));
  const result: Array<{ dateKey: string; count: number }> = [];

  for (let i = days - 1; i >= 0; i--) {
    const dateKey = getDateKey(Date.now() - i * 86400000);
    const item = statsMap.get(dateKey);
    result.push({
      dateKey,
      count: (item?.learned ?? 0) + (item?.reviewed ?? 0),
    });
  }

  return result;
}

export async function getRecentDailyStats(days = 7): Promise<DailyStatsRecord[]> {
  const rows = await db.dailyStats.toArray();
  const statsMap = new Map(rows.map((item) => [item.dateKey, item]));
  const result: DailyStatsRecord[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const dateKey = getDateKey(Date.now() - i * 86400000);
    result.push(statsMap.get(dateKey) ?? createEmptyDailyStatsRecord(dateKey));
  }

  return result;
}

export async function getStreakDays(): Promise<number> {
  const all = await db.dailyStats.toArray();
  const activeDays = new Set(
    all.filter((d) => d.learned + d.reviewed > 0).map((d) => d.dateKey),
  );

  let streak = 0;
  let cursor = getStartOfDay();

  while (true) {
    const dateKey = getDateKey(cursor);
    if (!activeDays.has(dateKey)) {
      break;
    }
    streak += 1;
    cursor -= 86400000;
  }

  return streak;
}

export async function getTodayStats(): Promise<DailyStatsRecord | null> {
  return (await db.dailyStats.get(getDateKey())) ?? null;
}

export async function getTodayReviewLogs(bookId?: string | null): Promise<ReviewLog[]> {
  const since = getStartOfDay();
  if (bookId) {
    return db.reviewLogs
      .where('bookId')
      .equals(bookId)
      .and((log) => log.timestamp >= since)
      .toArray();
  }

  return db.reviewLogs.where('timestamp').aboveOrEqual(since).toArray();
}

export async function getUnlockedAchievements(): Promise<AchievementRecord[]> {
  return db.achievements.orderBy('unlockedAt').reverse().toArray();
}

export async function unlockAchievement(id: string): Promise<AchievementRecord> {
  const existing = await db.achievements.get(id);
  if (existing) {
    return existing;
  }

  const record: AchievementRecord = {
    id,
    unlockedAt: now(),
  };
  await db.achievements.put(record);
  return record;
}

// 移动单词到另一个分组
export async function moveWordToBook(wordId: number, targetBookId: string): Promise<void> {
  const word = await db.words.get(wordId);
  if (!word) {
    throw new Error('单词不存在');
  }

  const targetBook = await db.books.get(targetBookId);
  if (!targetBook) {
    throw new Error('目标分组不存在');
  }

  const sourceBookId = word.bookId;
  if (sourceBookId === targetBookId) {
    return;
  }

  await db.transaction(
    'rw',
    [
      db.words,
      db.books,
      db.sm2Cards,
      db.wordStatuses,
      db.reviewLogs,
      db.chatMessages,
    ],
    async () => {
      const existingStatus = await db.wordStatuses.get([wordId, sourceBookId]);

      // 更新单词的分组
      await db.words.update(wordId, {
        bookId: targetBookId,
        updatedAt: now(),
      });

      await db.sm2Cards.update(wordId, {
        bookId: targetBookId,
        updatedAt: now(),
      });

      if (existingStatus) {
        await db.wordStatuses.delete([wordId, sourceBookId]);
        await db.wordStatuses.put({
          ...existingStatus,
          bookId: targetBookId,
        });
      }

      await db.reviewLogs
        .where('wordId')
        .equals(wordId)
        .modify((log) => {
          log.bookId = targetBookId;
        });
      await db.chatMessages
        .where('wordId')
        .equals(wordId)
        .modify((message) => {
          message.bookId = targetBookId;
        });

      // 更新源分组的单词数
      await updateBookWordCount(sourceBookId);

      // 更新目标分组的单词数
      await updateBookWordCount(targetBookId);
    },
  );
}

// 删除分组及其所有单词
export async function deleteBook(bookId: string): Promise<void> {
  const book = await db.books.get(bookId);
  if (!book) {
    throw new Error('分组不存在');
  }

  await db.transaction(
    'rw',
    [
      db.books,
      db.words,
      db.reviewLogs,
      db.sm2Cards,
      db.wordStatuses,
      db.learnSessions,
      db.chatMessages,
    ],
    async () => {
      // 获取该分组下的所有单词ID
      const wordsInBook = await db.words.where('bookId').equals(bookId).toArray();
      const wordIds = wordsInBook.map(w => w.id).filter((id): id is number => id !== undefined);

      // 删除相关的复习记录
      await db.reviewLogs.where('bookId').equals(bookId).delete();
      await db.wordStatuses.where('bookId').equals(bookId).delete();
      await db.learnSessions.where('bookId').equals(bookId).delete();
      await db.chatMessages.where('bookId').equals(bookId).delete();
      for (const wordId of wordIds) {
        await db.chatMessages.where('wordId').equals(wordId).delete();
      }

      // 删除该分组下的所有单词
      await db.words.where('bookId').equals(bookId).delete();
      await db.sm2Cards.where('bookId').equals(bookId).delete();

      // 删除分组
      await db.books.delete(bookId);
    },
  );
}

// 重命名分组
export async function renameBook(bookId: string, newName: string): Promise<void> {
  const book = await db.books.get(bookId);
  if (!book) {
    throw new Error('分组不存在');
  }

  await db.books.update(bookId, {
    name: newName,
    updatedAt: now(),
  });
}

// ========== 错词本 (Weak Words) ==========

/** 获取近期答错的单词（grade 0-2，最近 30 天内） */
export async function getWeakWords(
  bookId: string | null,
  limit = 50,
): Promise<Array<WordCard & { errorCount: number }>> {
  const since = Date.now() - 30 * 86400000; // 30 天前

  let logs;
  if (bookId) {
    logs = await db.reviewLogs
      .where('bookId')
      .equals(bookId)
      .and((log) => log.timestamp > since && (log.grade ?? 5) < 3)
      .toArray();
  } else {
    logs = await db.reviewLogs
      .where('timestamp')
      .above(since)
      .and((log) => (log.grade ?? 5) < 3)
      .toArray();
  }

  // 统计每个 wordId 的错误次数
  const errorMap = new Map<number, number>();
  for (const log of logs) {
    errorMap.set(log.wordId, (errorMap.get(log.wordId) ?? 0) + 1);
  }

  if (errorMap.size === 0) return [];

  // 按错误次数降序，取前 N 个
  const sortedIds = [...errorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  const words = await db.words.bulkGet(sortedIds);
  return words
    .filter((w): w is WordCard => w !== undefined)
    .map((w) => ({ ...w, errorCount: errorMap.get(w.id!) ?? 0 }));
}

/** 获取单词近期错误统计（用于 UI 展示） */
export async function getWordErrorCount(wordId: number): Promise<number> {
  const since = Date.now() - 30 * 86400000;
  return db.reviewLogs
    .where('wordId')
    .equals(wordId)
    .and((log) => log.timestamp > since && (log.grade ?? 5) < 3)
    .count();
}

/** 获取错词总数（用于标签显示） */
export async function getWeakWordsCount(bookId: string | null): Promise<number> {
  const weakWords = await getWeakWords(bookId, 1000);
  return weakWords.length;
}

export async function getTodayTaskSummary(bookId: string): Promise<TodayTaskSummary> {
  const [learnQueue, dueIds, weakCount, statusMap, words] = await Promise.all([
    getLearnQueue(bookId, 5000),
    getDueWordIdsByBook(bookId),
    getWeakWordsCount(bookId),
    getWordStatusesForBook(bookId),
    db.words.where('bookId').equals(bookId).and((word) => !word.deleted).toArray(),
  ]);

  const wordMap = new Map<number, WordCard>();
  words.forEach((word) => {
    if (typeof word.id === 'number') {
      wordMap.set(word.id, word);
    }
  });

  const outputCount = dueIds.filter((wordId) => {
    const status = statusMap.get(wordId);
    const word = wordMap.get(wordId);
    return (
      status?.wrongReason === 'spelling' ||
      status?.wrongReason === 'usage' ||
      word?.memoryType === 'spelling'
    );
  }).length;

  const base = {
    newCount: learnQueue.length,
    reviewCount: dueIds.length,
    weakCount,
    outputCount,
  };
  const suggestedAction = getSuggestedTaskAction(base);

  return {
    ...base,
    suggestedAction,
    ...buildTaskCopy(suggestedAction),
  };
}

// ── 图表数据查询函数 ────────────────────────────────────

/** 获取最近 N 天的每日统计（折线图 + 词汇增长曲线用） */
export async function getDailyStatsRange(days = 30): Promise<DailyStatsRecord[]> {
  const since = getStartOfDay(Date.now() - (days - 1) * 86400000);
  const rows = await db.dailyStats
    .where('dateKey')
    .aboveOrEqual(getDateKey(since))
    .toArray();

  // 补全缺失的日期（没有学习记录的天显示 0）
  const result: DailyStatsRecord[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = getDateKey(d.getTime());
    const found = rows.find((r) => r.dateKey === key);
    result.push(found ?? createEmptyDailyStatsRecord(key));
  }
  return result;
}

/** 获取掌握度分布（环形图用） */
export async function getMasteryDistribution(): Promise<{
  mastered: number;   // masteryLevel === 3
  familiar: number;   // masteryLevel === 2
  learning: number;   // masteryLevel === 1
  newWords: number;   // masteryLevel === 0（在 sm2Cards 里有记录但未开始）
  untouched: number;  // 根本没有 sm2Cards 记录的单词
}> {
  const [allWords, allCards] = await Promise.all([
    db.words.count(),
    db.sm2Cards.toArray(),
  ]);

  const dist = { mastered: 0, familiar: 0, learning: 0, newWords: 0, untouched: 0 };
  const touchedWordIds = new Set<number>();

  for (const card of allCards) {
    touchedWordIds.add(card.wordId);
    if (card.masteryLevel === 3) dist.mastered++;
    else if (card.masteryLevel === 2) dist.familiar++;
    else if (card.masteryLevel === 1) dist.learning++;
    else dist.newWords++;
  }

  dist.untouched = allWords - touchedWordIds.size;
  return dist;
}

/** 词汇量累计（增长曲线用） */
export async function getVocabGrowthData(
  days = 30,
  bookId?: string | null,
): Promise<Array<{ date: string; total: number; added: number }>> {
  const since = getStartOfDay(Date.now() - (days - 1) * 86400000);
  const recentWords = await db.words.where('createdAt').aboveOrEqual(since).toArray();
  const baseWords = await db.words.where('createdAt').below(since).toArray();
  const words = bookId ? recentWords.filter((word) => word.bookId === bookId) : recentWords;
  const historicalWords = bookId ? baseWords.filter((word) => word.bookId === bookId) : baseWords;

  // 按日期聚合
  const dailyAdded = new Map<string, number>();
  for (const word of words) {
    const key = getDateKey(word.createdAt);
    dailyAdded.set(key, (dailyAdded.get(key) ?? 0) + 1);
  }

  // 获取 since 之前的总词汇量作为基线
  const baseCount = historicalWords.length;

  const result: Array<{ date: string; total: number; added: number }> = [];
  let cumulative = baseCount;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = getDateKey(d.getTime());
    const added = dailyAdded.get(key) ?? 0;
    cumulative += added;
    result.push({
      date: key,
      total: cumulative,
      added,
    });
  }

  return result;
}

// ========== 背词模式 (Learn Mode) ==========

/** 获取已删除的单词 */
export async function getDeletedWords(bookId: string): Promise<WordCard[]> {
  return db.words
    .where('bookId')
    .equals(bookId)
    .and((w) => !!w.deleted)
    .toArray();
}

/** 软删除单词 */
export async function softDeleteWord(wordId: number): Promise<void> {
  const word = await db.words.get(wordId);
  if (!word) return;

  await db.transaction('rw', db.words, db.wordStatuses, db.books, async () => {
    await db.words.update(wordId, {
      deleted: true,
      deletedAt: now(),
      updatedAt: now(),
    });
    await db.wordStatuses.put({
      wordId,
      bookId: word.bookId,
      state: 'deleted',
    });
    await updateBookWordCount(word.bookId);
  });
}

/** 恢复已删除单词 */
export async function restoreWord(wordId: number): Promise<void> {
  const word = await db.words.get(wordId);
  if (!word) return;

  await db.transaction('rw', db.words, db.wordStatuses, db.books, async () => {
    await db.words.update(wordId, {
      deleted: false,
      deletedAt: undefined,
      updatedAt: now(),
    });
    await db.wordStatuses.put({
      wordId,
      bookId: word.bookId,
      state: 'new',
    });
    await updateBookWordCount(word.bookId);
  });
}

/** 获取单词状态 */
export async function getWordStatus(wordId: number, bookId: string): Promise<WordStatus | undefined> {
  return db.wordStatuses.get([wordId, bookId]);
}

/** 保存单词状态 */
export async function saveWordStatus(
  wordId: number,
  bookId: string,
  state: WordStatus['state'],
  options: {
    testPassed?: boolean;
    wrongReason?: ReviewWrongReason;
    sourceMode?: ReviewSourceMode;
    timestamp?: number;
  } = {},
): Promise<void> {
  await db.transaction('rw', db.wordStatuses, db.dailyStats, async () => {
    const existing = await db.wordStatuses.get([wordId, bookId]);
    const timestamp = options.timestamp ?? now();
    const isWrongState = state === 'unknown' || state === 'wrong';

    await db.wordStatuses.put({
      wordId,
      bookId,
      state,
      learnedAt: isLearnedWordState(state) ? existing?.learnedAt ?? timestamp : existing?.learnedAt,
      testedAt: options.testPassed !== undefined ? timestamp : existing?.testedAt,
      testPassed: options.testPassed ?? existing?.testPassed,
      wrongReason: isWrongState ? options.wrongReason ?? existing?.wrongReason : existing?.wrongReason,
      consecutiveWrongCount: isWrongState ? (existing?.consecutiveWrongCount ?? 0) + 1 : 0,
      lastReviewedAt: timestamp,
    });

    if (shouldCountAsNewLearning(existing, state)) {
      await incrementDailyNewLearning(timestamp);
    }
  });
}

/** 批量获取单词状态 */
export async function getWordStatusesForBook(bookId: string): Promise<Map<number, WordStatus>> {
  const statuses = await db.wordStatuses.where('bookId').equals(bookId).toArray();
  const map = new Map<number, WordStatus>();
  for (const s of statuses) {
    map.set(s.wordId, s);
  }
  return map;
}

/** 获取本组要学习的单词（未学习且未删除） */
export async function getLearnQueue(
  bookId: string,
  limit = 20,
): Promise<Array<WordCard & { state: WordStatus['state'] }>> {
  const [words, statusMap] = await Promise.all([
    db.words.where('bookId').equals(bookId).and((w) => !w.deleted).toArray(),
    getWordStatusesForBook(bookId),
  ]);

  // 只取 state 为 new 或未设置状态的单词
  const queue: Array<WordCard & { state: WordStatus['state'] }> = [];
  for (const word of words) {
    const status = word.id ? statusMap.get(word.id) : undefined;
    if (!status || status.state === 'new') {
      queue.push({ ...word, state: status?.state ?? 'new' });
    }
    if (queue.length >= limit) break;
  }

  return queue;
}

/** 获取测试队列（unknown 或 wrong 状态） */
export async function getTestQueue(
  bookId: string,
  wordIds: number[],
): Promise<WordCard[]> {
  const [words, statusMap] = await Promise.all([
    db.words.bulkGet(wordIds),
    getWordStatusesForBook(bookId),
  ]);

  const queue: WordCard[] = [];
  for (const word of words) {
    if (!word || !word.id) continue;
    const status = statusMap.get(word.id);
    if (status && (status.state === 'unknown' || status.state === 'wrong')) {
      queue.push(word);
    }
  }

  // 打乱顺序
  return queue.sort(() => Math.random() - 0.5);
}

/** 创建学习会话 */
export async function createLearnSession(
  bookId: string,
  totalWords: number,
): Promise<number> {
  return db.learnSessions.add({
    bookId,
    startedAt: now(),
    totalWords,
    knownCount: 0,
    unknownCount: 0,
    wrongCount: 0,
    passedTest: 0,
  });
}

/** 更新学习会话统计 */
export async function updateLearnSession(
  sessionId: number,
  updates: Partial<LearnSession>,
): Promise<void> {
  await db.learnSessions.update(sessionId, updates);
}

/** 完成学习会话 */
export async function finishLearnSession(sessionId: number): Promise<void> {
  await db.learnSessions.update(sessionId, {
    finishedAt: now(),
  });
}

/** 更新单词笔记 */
export async function updateWordNote(wordId: number, note: string): Promise<void> {
  await db.words.update(wordId, {
    note,
    updatedAt: now(),
  });
}

/** 获取带笔记的单词列表 */
export async function getWordsWithNotes(bookId?: string): Promise<WordCard[]> {
  let collection = db.words.filter((w) => !!w.note && w.note !== '');
  if (bookId) {
    collection = collection.and((w) => w.bookId === bookId);
  }
  return collection.toArray();
}
