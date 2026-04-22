import type { AppSettings, WordCard } from './types';

export const SWIPE_THRESHOLD = 50;
export const SWIPE_VELOCITY = 0.3;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }

  return `${value.toFixed(1)} ${units[index]}`;
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export async function compressImage(file: File, maxBytes = 1024 * 1024): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  if (file.size <= maxBytes) {
    return file;
  }

  const imageBitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  let width = imageBitmap.width;
  let height = imageBitmap.height;
  const maxDimension = 1800;

  if (Math.max(width, height) > maxDimension) {
    const ratio = maxDimension / Math.max(width, height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('无法创建图片处理上下文');
  }

  context.drawImage(imageBitmap, 0, 0, width, height);

  let quality = 0.86;
  let blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });

  while (blob && blob.size > maxBytes && quality > 0.4) {
    quality -= 0.08;
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
  }

  while (blob && blob.size > maxBytes && width > 640 && height > 640) {
    width = Math.round(width * 0.9);
    height = Math.round(height * 0.9);
    canvas.width = width;
    canvas.height = height;
    context.drawImage(imageBitmap, 0, 0, width, height);
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
  }

  if (!blob) {
    throw new Error('图片压缩失败');
  }

  const finalName = file.name.replace(/\.[^.]+$/, '.jpg');
  return new File([blob], finalName, { type: 'image/jpeg' });
}

export function splitPosMeaning(posRaw: string, meaningRaw: string): Array<{ pos: string; meaning: string }> {
  const posList = posRaw
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);

  const meanings = meaningRaw
    .split(/;|；/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!posList.length) {
    return meanings.map((meaning) => ({ pos: 'mean.', meaning }));
  }

  return meanings.map((meaning, index) => ({
    pos: posList[Math.min(index, posList.length - 1)] ?? 'mean.',
    meaning,
  }));
}

export function getLevelTagClass(level: string): string {
  switch (level) {
    case 'CET4':
      return 'level-tag cet4';
    case 'CET6':
      return 'level-tag cet6';
    case '考研':
      return 'level-tag kaoyan';
    case '雅思':
      return 'level-tag ielts';
    case '托福':
      return 'level-tag toefl';
    default:
      return 'level-tag';
  }
}

export function pickPreferredVoice(lang: 'en-GB' | 'en-US'): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();
  const exact = voices.find((voice) => voice.lang.toLowerCase() === lang.toLowerCase());
  if (exact) {
    return exact;
  }
  return voices.find((voice) => voice.lang.toLowerCase().startsWith('en')) ?? null;
}

export function speakWord(
  text: string,
  settings: AppSettings,
  accent: 'uk' | 'us' = 'uk',
  onStateChange?: (state: 'loading' | 'playing' | 'error' | 'done') => void,
): void {
  if (!text.trim()) return;

  // 使用新的 TTS 模块（支持 OpenAI TTS 和浏览器 TTS）
  void import('./tts')
    .then(({ speakWord: speakWithTTS }) => speakWithTTS(text, settings, accent, onStateChange))
    .catch((error) => {
      console.warn('TTS playback failed:', error);
      onStateChange?.('error');
    });
}

export function parseMaybeJsonArray(input: string): unknown[] | null {
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeExtractedWord(
  draft: Partial<WordCard> & { word?: string },
): Omit<WordCard, 'id' | 'bookId' | 'createdAt' | 'updatedAt'> | null {
  if (!draft.word?.trim()) {
    return null;
  }

  const normalizedWord = draft.word.trim();

  return {
    word: normalizedWord,
    phonetic_uk: draft.phonetic_uk ?? '',
    phonetic_us: draft.phonetic_us ?? '',
    pos: draft.pos ?? 'n.',
    meaning_brief: draft.meaning_brief ?? '',
    meaning_collins: draft.meaning_collins,
    meaning_advanced: Array.isArray(draft.meaning_advanced) ? draft.meaning_advanced : [],
    word_forms: draft.word_forms ?? {},
    level_tag: Array.isArray(draft.level_tag) ? draft.level_tag : [],
    origin_sentence: draft.origin_sentence,
    origin_translation: draft.origin_translation,
    ai_example_en: draft.ai_example_en ?? '',
    ai_example_zh: draft.ai_example_zh ?? '',
    synonyms: Array.isArray(draft.synonyms) ? draft.synonyms.filter(Boolean) : [],
    antonyms: Array.isArray(draft.antonyms) ? draft.antonyms.filter(Boolean) : [],
    related: Array.isArray(draft.related) ? draft.related.filter(Boolean) : [],
    mnemonic: draft.mnemonic,
    favorited: draft.favorited ?? false,
    masteryLevel: draft.masteryLevel ?? 0,
    nextReviewAt: draft.nextReviewAt,
    easeFactor: draft.easeFactor,
    wrongCount: draft.wrongCount ?? 0,
  };
}

export function createDownload(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs = 30000): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`请求超时（超过 ${timeoutMs / 1000} 秒）`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}
