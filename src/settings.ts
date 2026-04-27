import type { AppSettings, ThemePreset, VocabExtractMode } from './types';
import { matchesMediaQuery } from './browser';

export const SETTINGS_STORAGE_KEY = 'linguaflash_settings';
export const ONBOARDING_DONE_KEY = 'onboarding_done';
export const DEFAULT_WALLPAPER_IMAGE =
  'linear-gradient(135deg, #eef2ff 0%, #dbeafe 45%, #e0e7ff 100%)';
type ResolvedThemeMode = 'light' | 'dark';
type ThemeWallpaperSet = Record<ResolvedThemeMode, string>;

const DEFAULT_THEME_WALLPAPERS: Record<ThemePreset, ThemeWallpaperSet> = {
  classic: {
    light: DEFAULT_WALLPAPER_IMAGE,
    dark: DEFAULT_WALLPAPER_IMAGE,
  },
  mist: {
    light:
      'radial-gradient(circle at 18% 12%, rgba(69, 104, 131, 0.08), transparent 28%), linear-gradient(180deg, #f7f3ec 0%, #f2eee6 56%, #ebe6dc 100%)',
    dark:
      'radial-gradient(circle at 18% 12%, rgba(157, 184, 204, 0.12), transparent 24%), linear-gradient(180deg, #121417 0%, #171b20 52%, #1e2329 100%)',
  },
  pulse: {
    light:
      'linear-gradient(rgba(8, 197, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(8, 197, 255, 0.1) 1px, transparent 1px), radial-gradient(circle at 14% 18%, rgba(103, 232, 255, 0.32), transparent 24%), radial-gradient(circle at 82% 12%, rgba(8, 197, 255, 0.18), transparent 28%), linear-gradient(145deg, #f1faff 0%, #d7edff 46%, #edf9ff 100%)',
    dark:
      'linear-gradient(rgba(68, 231, 255, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(68, 231, 255, 0.08) 1px, transparent 1px), radial-gradient(circle at 18% 16%, rgba(68, 231, 255, 0.24), transparent 24%), radial-gradient(circle at 86% 10%, rgba(25, 192, 255, 0.18), transparent 22%), linear-gradient(145deg, #020815 0%, #071628 46%, #0c2542 100%)',
  },
};
const THEME_PRESET_VALUES = new Set<ThemePreset>(['classic', 'mist', 'pulse']);
const VOCAB_EXTRACT_MODE_VALUES = new Set<VocabExtractMode>([
  'large_only',
  'large_structure_small_enrich',
  'small_only',
]);
const LEGACY_THEME_PRESET_ALIASES: Record<string, ThemePreset> = {
  dawn: 'classic',
  forest: 'mist',
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'auto',
  language: 'zh-CN',
  defaultLevel: 'CET6',
  vocabExtractMode: 'large_structure_small_enrich',
  aiAssistant: {
    enabled: true,
    displayMode: 'visible',
  },
  llm: {
    provider: 'deepseek',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  smallLlm: {
    provider: 'deepseek',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  ocr: {
    type: 'deepseek',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-ocr',
  },
  exa: {
    apiKey: '',
    baseUrl: 'https://api.exa.ai',
    defaultNumResults: 5,
  },
  tts: {
    type: 'browser',
    voice: 'alloy',
    speed: 1.0,
  },
  appearance: {
    preset: 'classic',
    wallpaperType: 'default',
    motionEffects: true,
    brightness: 0.92,
    blur: 0,
    overlayOpacity: 0.04,
    fontFamily: 'system-ui',
  },
  bgMusic: {
    enabled: false,
    volume: 0.2,
  },
  goals: {
    dailyNewWords: 10,
    dailyReviewWords: 20,
    reminderTime: '20:00',
  },
  sm2: {
    grade0Minutes: 2,
    grade1Minutes: 10,
    grade2Days: 1,
    grade3Multiplier: 1.3,
    grade4Multiplier: 2,
    grade5Multiplier: 2.5,
  },
  learn: {
    groupSize: 20,
    spellingTest: true,
    firstLetterHint: true,
    maxReviewRounds: 3,
  },
  sentencePractice: {
    enabled: false,
    aiEnabled: true,
    feedbackCriteria: ['grammar', 'vocabulary', 'semantic', 'improvement', 'score'],
    aiRole: {
      name: '老师',
      personality: '严谨、耐心，像老师与好友的结合体，指出问题并给出鼓励。',
    },
  },
};

type JsonObject = Record<string, unknown>;
const BLOCKED_MERGE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SAFE_IMAGE_DATA_URL =
  /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i;
const SAFE_AUDIO_DATA_URL = /^data:audio\/mpeg;base64,[a-z0-9+/=\s]+$/i;
const MAX_WALLPAPER_DATA_URL_LENGTH = 8 * 1024 * 1024;
const MAX_AUDIO_DATA_URL_LENGTH = 8 * 1024 * 1024;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMergeObject(base: JsonObject, patch: JsonObject): JsonObject {
  const result: JsonObject = { ...base };

  for (const key of Object.keys(patch)) {
    if (BLOCKED_MERGE_KEYS.has(key)) {
      continue;
    }

    const patchValue = patch[key];
    if (patchValue === undefined) {
      continue;
    }

    const baseValue = result[key];

    if (isPlainObject(baseValue) && isPlainObject(patchValue)) {
      result[key] = deepMergeObject(baseValue, patchValue);
      continue;
    }

    result[key] = patchValue;
  }

  return result;
}

export function deepMerge<T>(base: T, patch: Partial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch as T;
  }

  return deepMergeObject(base, patch) as T;
}

function safeParse(raw: string | null): Partial<AppSettings> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeDataUrl(
  value: unknown,
  pattern: RegExp,
  maxLength: number,
): string | undefined {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > maxLength) {
    return undefined;
  }
  if (!pattern.test(normalized)) {
    return undefined;
  }
  return normalized.replace(/\s+/g, '');
}

function replaceControlCharacters(value: string): string {
  let normalized = '';

  for (const char of value) {
    const code = char.charCodeAt(0);
    normalized += code <= 31 || code === 127 ? ' ' : char;
  }

  return normalized;
}

function sanitizeFileName(value: unknown): string | undefined {
  const normalized = replaceControlCharacters(String(value ?? ''))
    .trim()
    .slice(0, 120);
  return normalized || undefined;
}

function normalizeThemePreset(value: unknown): ThemePreset {
  if (typeof value !== 'string') {
    return DEFAULT_SETTINGS.appearance.preset;
  }

  if (THEME_PRESET_VALUES.has(value as ThemePreset)) {
    return value as ThemePreset;
  }

  return LEGACY_THEME_PRESET_ALIASES[value] ?? DEFAULT_SETTINGS.appearance.preset;
}

function normalizeVocabExtractMode(value: unknown): VocabExtractMode {
  return VOCAB_EXTRACT_MODE_VALUES.has(value as VocabExtractMode)
    ? (value as VocabExtractMode)
    : DEFAULT_SETTINGS.vocabExtractMode;
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const wallpaperBase64 = sanitizeDataUrl(
    settings.appearance.wallpaperBase64,
    SAFE_IMAGE_DATA_URL,
    MAX_WALLPAPER_DATA_URL_LENGTH,
  );
  const bgMusicBase64 = sanitizeDataUrl(
    settings.bgMusic.base64,
    SAFE_AUDIO_DATA_URL,
    MAX_AUDIO_DATA_URL_LENGTH,
  );

  return {
    ...settings,
    vocabExtractMode: normalizeVocabExtractMode(settings.vocabExtractMode),
    exa: {
      ...settings.exa,
      defaultNumResults: Math.round(
        clampNumber(
          settings.exa.defaultNumResults,
          1,
          20,
          DEFAULT_SETTINGS.exa.defaultNumResults,
        ),
      ),
    },
    tts: {
      ...settings.tts,
      speed: clampNumber(settings.tts.speed, 0.25, 4, DEFAULT_SETTINGS.tts.speed ?? 1),
    },
    appearance: {
      ...settings.appearance,
      preset: normalizeThemePreset(settings.appearance.preset),
      wallpaperType: wallpaperBase64 ? settings.appearance.wallpaperType : 'default',
      wallpaperBase64,
      motionEffects: settings.appearance.motionEffects !== false,
      brightness: clampNumber(
        settings.appearance.brightness,
        0.2,
        1.2,
        DEFAULT_SETTINGS.appearance.brightness,
      ),
      blur: clampNumber(settings.appearance.blur, 0, 40, DEFAULT_SETTINGS.appearance.blur),
      overlayOpacity: clampNumber(
        settings.appearance.overlayOpacity,
        0,
        0.75,
        DEFAULT_SETTINGS.appearance.overlayOpacity,
      ),
      fontFamily: typeof settings.appearance.fontFamily === 'string' ? settings.appearance.fontFamily : 'system-ui',
    },
    bgMusic: {
      ...settings.bgMusic,
      enabled: Boolean(settings.bgMusic.enabled && bgMusicBase64),
      base64: bgMusicBase64,
      fileName: sanitizeFileName(settings.bgMusic.fileName),
      volume: clampNumber(settings.bgMusic.volume, 0, 1, DEFAULT_SETTINGS.bgMusic.volume),
    },
    goals: {
      ...settings.goals,
      dailyNewWords: Math.round(
        clampNumber(
          settings.goals.dailyNewWords,
          1,
          500,
          DEFAULT_SETTINGS.goals.dailyNewWords,
        ),
      ),
      dailyReviewWords: Math.round(
        clampNumber(
          settings.goals.dailyReviewWords,
          1,
          500,
          DEFAULT_SETTINGS.goals.dailyReviewWords,
        ),
      ),
    },
    sm2: {
      ...settings.sm2,
      grade0Minutes: Math.round(
        clampNumber(
          settings.sm2.grade0Minutes,
          1,
          1440,
          DEFAULT_SETTINGS.sm2.grade0Minutes,
        ),
      ),
      grade1Minutes: Math.round(
        clampNumber(
          settings.sm2.grade1Minutes,
          1,
          1440,
          DEFAULT_SETTINGS.sm2.grade1Minutes,
        ),
      ),
      grade2Days: Math.round(
        clampNumber(settings.sm2.grade2Days, 1, 365, DEFAULT_SETTINGS.sm2.grade2Days),
      ),
      grade3Multiplier: clampNumber(
        settings.sm2.grade3Multiplier,
        1,
        5,
        DEFAULT_SETTINGS.sm2.grade3Multiplier,
      ),
      grade4Multiplier: clampNumber(
        settings.sm2.grade4Multiplier,
        1,
        5,
        DEFAULT_SETTINGS.sm2.grade4Multiplier,
      ),
      grade5Multiplier: clampNumber(
        settings.sm2.grade5Multiplier,
        1,
        6,
        DEFAULT_SETTINGS.sm2.grade5Multiplier,
      ),
    },
    learn: {
      ...settings.learn,
      groupSize: Math.round(
        clampNumber(settings.learn.groupSize, 1, 100, DEFAULT_SETTINGS.learn.groupSize),
      ),
      maxReviewRounds: Math.round(
        clampNumber(
          settings.learn.maxReviewRounds,
          1,
          10,
          DEFAULT_SETTINGS.learn.maxReviewRounds,
        ),
      ),
    },
  };
}

export function loadSettings(): AppSettings {
  const parsed = safeParse(localStorage.getItem(SETTINGS_STORAGE_KEY));
  return normalizeSettings(deepMerge(DEFAULT_SETTINGS, parsed));
}

export function applyTheme(theme: AppSettings['theme']): void {
  const root = document.documentElement;
  const prefersDark = matchesMediaQuery('(prefers-color-scheme: dark)');
  const resolved = theme === 'auto' ? (prefersDark ? 'dark' : 'light') : theme;
  root.setAttribute('data-theme', resolved);
}

function resolveThemeMode(theme: AppSettings['theme']): ResolvedThemeMode {
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }

  return matchesMediaQuery('(prefers-color-scheme: dark)') ? 'dark' : 'light';
}

function getDefaultWallpaperImage(
  preset: ThemePreset,
  themeMode: ResolvedThemeMode,
): string {
  return DEFAULT_THEME_WALLPAPERS[preset]?.[themeMode] ?? DEFAULT_WALLPAPER_IMAGE;
}

export function resolveWallpaperImage(
  appearance: AppSettings['appearance'],
  theme: AppSettings['theme'] = 'auto',
): string {
  const wallpaperBase64 = sanitizeDataUrl(
    appearance.wallpaperBase64,
    SAFE_IMAGE_DATA_URL,
    MAX_WALLPAPER_DATA_URL_LENGTH,
  );

  if (appearance.wallpaperType === 'custom' && wallpaperBase64) {
    return `url("${wallpaperBase64.replace(/"/g, '%22')}")`;
  }

  return getDefaultWallpaperImage(appearance.preset, resolveThemeMode(theme));
}

export function applyAppearance(
  appearance: AppSettings['appearance'],
  theme: AppSettings['theme'] = 'auto',
): void {
  const root = document.documentElement;
  root.setAttribute('data-ui-theme', appearance.preset);
  root.setAttribute('data-motion', appearance.motionEffects ? 'full' : 'off');
  root.style.setProperty('--bg-blur', `${appearance.blur}px`);
  root.style.setProperty('--bg-brightness', `${appearance.brightness}`);
  root.style.setProperty('--bg-overlay', `${appearance.overlayOpacity}`);
  root.style.setProperty('--wallpaper-image', resolveWallpaperImage(appearance, theme));

  const fontFamily = appearance.fontFamily || 'system-ui';
  if (fontFamily === 'system-ui') {
    root.style.setProperty('--font-family', "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif");
  } else {
    root.style.setProperty('--font-family', fontFamily);
  }

  const wallpaperBase64 = sanitizeDataUrl(
    appearance.wallpaperBase64,
    SAFE_IMAGE_DATA_URL,
    MAX_WALLPAPER_DATA_URL_LENGTH,
  );

  if (appearance.wallpaperType === 'custom' && wallpaperBase64) {
    root.setAttribute('data-custom-wallpaper', 'true');
  } else {
    root.removeAttribute('data-custom-wallpaper');
  }
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const updated = normalizeSettings(deepMerge(current, partial));

  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    throw new Error('SETTINGS_STORAGE_FULL');
  }

  if (partial.theme) {
    applyTheme(updated.theme);
  }
  if (partial.appearance || partial.theme) {
    applyAppearance(updated.appearance, updated.theme);
  }

  return updated;
}

export function shouldShowOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_DONE_KEY) !== 'true';
}

export function markOnboardingDone(): void {
  localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
}
