export interface WordCard {
  id?: number;
  bookId: string;
  word: string;
  phonetic_uk: string;
  phonetic_us: string;
  pos: string;
  meaning_brief: string;
  meaning_collins?: string;
  meaning_advanced: Array<{ def: string; example: string }>;
  word_forms: {
    plural?: string;
    third_singular?: string;
    present_participle?: string;
    past_tense?: string;
    past_participle?: string;
  };
  level_tag: string[];
  origin_sentence?: string;
  origin_translation?: string;
  ai_example_en: string;
  ai_example_zh: string;
  synonyms?: string[];
  antonyms?: string[];
  related?: string[];
  mnemonic?: string;
  favorited?: boolean;
  masteryLevel?: 0 | 1 | 2 | 3;
  nextReviewAt?: number;
  easeFactor?: number;
  wrongCount?: number;
  // 背词模式新增字段
  memoryType?: 'spelling' | 'recognition' | null;
  note?: string;
  deleted?: boolean;
  deletedAt?: number;
  examSentence?: string;
  examSentenceZh?: string;
  commonPhrases?: Array<{ phrase: string; meaning: string }>;
  derivatives?: Array<{ word: string; pos: string; meaning: string }>;
  createdAt: number;
  updatedAt: number;
}

export interface Book {
  id: string;
  name: string;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewLog {
  id?: number;
  wordId: number;
  bookId: string;
  result: 'easy' | 'hard';
  mode: 'zh2en' | 'en2zh';
  timestamp: number;
  grade?: number; // SM2 grade 0-5, for weak words tracking
  wrongReason?: ReviewWrongReason;
  sourceMode?: ReviewSourceMode;
}

export type ReviewWrongReason = 'meaning' | 'confusion' | 'spelling' | 'usage';
export type ReviewSourceMode = 'cards' | 'learn' | 'test' | 'reading' | 'sentence' | 'weak';

export interface SM2CardRecord {
  wordId: number;
  bookId: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: number;
  masteryLevel: 0 | 1 | 2 | 3;
  wrongCount: number;
  updatedAt: number;
  createdAt: number;
}

export interface DailyStatsRecord {
  dateKey: string;
  learned: number;
  reviewed: number;
  newWordsDone: number;
  reviewDone: number;
  perfectDay: number;
  fastAnswers: number;
  nightSessions: number;
  updatedAt: number;
  createdAt: number;
}

export interface AchievementRecord {
  id: string;
  unlockedAt: number;
}

// 背词模式 - 当次背词会话
export interface LearnSession {
  id?: number;
  bookId: string;
  startedAt: number;
  finishedAt?: number;
  totalWords: number;
  knownCount: number;
  unknownCount: number;
  wrongCount: number;
  passedTest: number;
}

// 背词模式 - 每个单词的背词状态
export interface WordStatus {
  wordId: number;
  bookId: string;
  state: 'new' | 'known' | 'unknown' | 'wrong' | 'deleted';
  learnedAt?: number;
  testedAt?: number;
  testPassed?: boolean;
  wrongReason?: ReviewWrongReason;
  consecutiveWrongCount?: number;
  lastReviewedAt?: number;
}

export type TodayTaskAction = 'learn' | 'review' | 'weak' | 'output' | 'done';

export interface TodayTaskSummary {
  newCount: number;
  reviewCount: number;
  weakCount: number;
  outputCount: number;
  suggestedAction: TodayTaskAction;
  headline: string;
  subline: string;
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  word?: string;
  wordId?: number;
  bookId?: string;
  source?: AIAssistantContextSource;
}

export interface AIAssistantSettings {
  enabled: boolean;
  displayMode: 'visible' | 'hidden';
}

export type SentencePracticeMode = 'en2zh' | 'zh2en';

export type SentenceFeedbackCriterion =
  | 'grammar'
  | 'vocabulary'
  | 'semantic'
  | 'improvement'
  | 'score';

export interface SentencePracticeAIProfile {
  name: string;
  personality: string;
}

export interface SentencePracticeSettings {
  enabled: boolean;
  aiEnabled: boolean;
  feedbackCriteria: SentenceFeedbackCriterion[];
  aiRole: SentencePracticeAIProfile;
}

export interface SentenceEvaluationResult {
  score?: number;
  feedback: Partial<Record<'grammar' | 'vocabulary' | 'semantic' | 'improvement', string>>;
  detailedComment: string;
}

export interface ReadingKeyword {
  word: string;
  meaning_zh: string;
  example_en: string;
  example_zh: string;
}

export interface ReadingQuestion {
  question: string;
  options: string[];
  answer: 'A' | 'B' | 'C' | 'D';
  explanation_zh: string;
}

export interface ReadingSource {
  title: string;
  url: string;
  publishedDate?: string;
}

export type ReadingSourceMode = 'exa' | 'builtin';
export type ReadingBuiltinEngine = 'google' | 'bing';

export interface ReadingArticleResult {
  sourceMode: ReadingSourceMode;
  builtinEngine?: ReadingBuiltinEngine;
  requestedBuiltinEngine?: ReadingBuiltinEngine;
  builtinFallbackApplied?: boolean;
  query: string;
  levelTag: string;
  title: string;
  articleZh: string;
  article: string;
  wordCount: number;
  requestedWordCount?: number;
  keywords: ReadingKeyword[];
  questions: ReadingQuestion[];
  sources: ReadingSource[];
}

export type AIAssistantContextSource = 'cards' | 'test' | 'learn' | 'unknown';

export interface AIAssistantWordContext {
  word: string;
  meaningBrief?: string;
  pos?: string;
  phoneticUk?: string;
  phoneticUs?: string;
  wordId?: number;
  bookId?: string;
  source: AIAssistantContextSource;
}

export type ThemePreset = 'classic' | 'mist' | 'pulse';
export type VocabExtractMode = 'large_only' | 'large_structure_small_enrich' | 'small_only';

export interface AppSettings {
  theme: 'light' | 'dark' | 'auto';
  language: 'zh-CN' | 'en-US';
  defaultLevel: string;
  vocabExtractMode: VocabExtractMode;

  aiAssistant: AIAssistantSettings;

  llm: {
    provider: 'deepseek' | 'openai' | 'zhipu' | 'custom';
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature?: number; // undefined = auto-detect based on model name
  };

  smallLlm: {
    provider: 'deepseek' | 'openai' | 'zhipu' | 'custom';
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature?: number; // undefined = auto-detect based on model name
  };

  ocr: {
    type: 'deepseek' | 'selfhosted';
    apiKey?: string;
    baseUrl: string;
    model: string;
  };

  exa: {
    apiKey: string;
    baseUrl: string;
    defaultNumResults: number;
  };

  tts: {
    type: 'browser' | 'openai' | 'azure';
    voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    speed?: number;
    azureKey?: string;
    azureRegion?: string;
  };

  appearance: {
    preset: ThemePreset;
    wallpaperType: 'default' | 'custom';
    wallpaperBase64?: string;
    motionEffects: boolean;
    brightness: number;
    blur: number;
    overlayOpacity: number;
    fontFamily?: string;
  };

  bgMusic: {
    enabled: boolean;
    base64?: string;
    fileName?: string;
    volume: number;
  };

  goals: {
    dailyNewWords: number;
    dailyReviewWords: number;
    reminderTime: string;
  };

  sm2: {
    grade0Minutes: number;
    grade1Minutes: number;
    grade2Days: number;
    grade3Multiplier: number;
    grade4Multiplier: number;
    grade5Multiplier: number;
  };

  // 背词模式设置
  learn: {
    groupSize: number;        // 每组单词数，默认 20
    spellingTest: boolean;    // 拼写测试开关，默认 true
    firstLetterHint: boolean; // 首字母提示，默认 true
    maxReviewRounds: number;  // 最大复习轮次，默认 3
  };

  // 句子填空设置
  sentencePractice: SentencePracticeSettings;
}

export type TabKey = 'cards' | 'learn' | 'en2zh' | 'zh2en' | 'reading' | 'library';

export type SettingsGroup =
  | 'general'
  | 'goals'
  | 'learn'
  | 'model'
  | 'exa'
  | 'ocr'
  | 'speech'
  | 'appearance'
  | 'data'
  | 'about';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export interface PreparedFile {
  name: string;
  type: string;
  size: number;
  base64: string;
}

export interface ExtractedWordDraft {
  word: string;
  phonetic_uk?: string;
  phonetic_us?: string;
  pos?: string;
  meaning_brief?: string;
  meaning_collins?: string;
  meaning_advanced?: Array<{ def: string; example: string }>;
  word_forms?: {
    plural?: string;
    third_singular?: string;
    present_participle?: string;
    past_tense?: string;
    past_participle?: string;
  };
  level_tag?: string[];
  origin_sentence?: string;
  origin_translation?: string;
  ai_example_en?: string;
  ai_example_zh?: string;
  synonyms?: string[];
  antonyms?: string[];
  related?: string[];
  mnemonic?: string;
}
