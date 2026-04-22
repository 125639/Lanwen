import type { AppSettings } from './types';
import { getApiBase } from './apiBase';

interface TTSOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed?: number;
  accent?: 'uk' | 'us';
}

type PlaybackState = 'loading' | 'playing' | 'error' | 'done';
type PlaybackStateChange = (state: PlaybackState) => void;

// 音频缓存，避免重复请求
const audioCache = new Map<string, string>(); // cacheKey → objectURL

// 当前播放的音频实例（用于暂停）
let currentAudio: HTMLAudioElement | null = null;

function stopActivePlayback(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * 使用 API 播放 TTS
 */
export async function speakWithAPI(
  text: string,
  settings: AppSettings,
  options: TTSOptions = {},
  onStateChange?: PlaybackStateChange,
): Promise<void> {
  const voice = options.voice ?? (options.accent === 'uk' ? 'fable' : 'alloy');
  const speed = options.speed ?? 1.0;
  const cacheKey = `${text}-${voice}-${speed}`;

  stopActivePlayback();

  let url = audioCache.get(cacheKey);

  if (!url) {
    const response = await fetch(`${getApiBase()}/api/tts/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice,
        speed,
        llm: settings.llm,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'TTS request failed' }));
      throw new Error(error.error || 'TTS request failed');
    }

    const blob = await response.blob();
    url = URL.createObjectURL(blob);
    audioCache.set(cacheKey, url);

    // 最多缓存 50 条
    if (audioCache.size > 50) {
      const firstKey = audioCache.keys().next().value as string | undefined;
      if (firstKey) {
        const oldUrl = audioCache.get(firstKey);
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        audioCache.delete(firstKey);
      }
    }
  }

  const audio = new Audio(url);
  audio.playbackRate = speed;
  currentAudio = audio;

  return new Promise((resolve, reject) => {
    audio.onplay = () => {
      onStateChange?.('playing');
    };
    audio.onended = () => {
      currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      currentAudio = null;
      reject(new Error('Audio playback failed'));
    };
    void audio.play().catch((error) => {
      currentAudio = null;
      reject(error instanceof Error ? error : new Error('Audio playback failed'));
    });
  });
}

/**
 * 降级到浏览器 TTS
 */
export function speakWithBrowser(
  text: string,
  accent: 'uk' | 'us' = 'us',
  onStateChange?: PlaybackStateChange,
): Promise<void> {
  if (!window.speechSynthesis) {
    return Promise.reject(new Error('当前浏览器不支持语音合成'));
  }

  stopActivePlayback();

  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = accent === 'uk' ? 'en-GB' : 'en-US';
  utt.rate = 0.9;

  return new Promise((resolve, reject) => {
    utt.onstart = () => {
      onStateChange?.('playing');
    };
    utt.onend = () => {
      onStateChange?.('done');
      resolve();
    };
    utt.onerror = () => {
      onStateChange?.('error');
      reject(new Error('Browser TTS failed'));
    };

    window.speechSynthesis.speak(utt);
  });
}

/**
 * 主入口：优先 API，降级浏览器
 */
export async function speakWord(
  text: string,
  settings: AppSettings,
  accent: 'uk' | 'us' = 'us',
  onStateChange?: PlaybackStateChange,
): Promise<void> {
  // 如果配置了 OpenAI TTS 且有 API Key
  if (settings.tts?.type === 'openai' && settings.llm?.apiKey) {
    try {
      onStateChange?.('loading');
      await speakWithAPI(text, settings, { accent }, onStateChange);
      onStateChange?.('done');
      return;
    } catch (err) {
      console.warn('TTS API failed, falling back to browser:', err);
      await speakWithBrowser(text, accent, onStateChange);
      return;
    }
  }

  // 使用浏览器 TTS
  await speakWithBrowser(text, accent, onStateChange);
}

/**
 * 停止当前播放
 */
export function stopSpeaking(): void {
  stopActivePlayback();
}

/**
 * 获取播放状态
 */
export function isSpeaking(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}

/**
 * 简化的单词播放接口（用于背词模式）
 */
export function playWordAudio(word: string, accent: 'uk' | 'us' = 'us'): void {
  void speakWithBrowser(word, accent).catch(() => undefined);
}
