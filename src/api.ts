import type {
  AIAssistantWordContext,
  AppSettings,
  ChatMessage,
  ExtractedWordDraft,
  PreparedFile,
  ReadingArticleResult,
  ReadingBuiltinEngine,
  ReadingSourceMode,
  SentenceEvaluationResult,
  SentenceFeedbackCriterion,
  SentencePracticeAIProfile,
  SentencePracticeMode,
  VocabExtractMode,
} from './types';
import { withTimeout } from './utils';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();
const OCR_MIN_TIMEOUT_MS = 120000;
const OCR_TIMEOUT_PER_FILE_MS = 75000;

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

interface OCRResponse {
  text: string;
  items: Array<{ name: string; text: string }>;
}

export interface PipelineFailure {
  word?: string;
  message: string;
  batchIndex?: number;
}

export type ExtractPipelineEvent =
  | { type: 'status'; stage?: string; message?: string }
  | { type: 'structured'; count: number; total?: number }
  | { type: 'batch'; batchIndex: number; totalBatches: number; completed?: number; total?: number; failed?: number }
  | { type: 'word'; word: ExtractedWordDraft; completed: number; total: number; failed: number }
  | { type: 'failure'; message: string; failed: number; batchIndex?: number; items?: Array<{ word?: string }> }
  | { type: 'complete'; completed: number; total: number; failed: number; failures?: PipelineFailure[] };

export interface ExtractPipelineResult {
  words: ExtractedWordDraft[];
  completed: number;
  total: number;
  failed: number;
  failures: PipelineFailure[];
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(apiUrl('/api/health'));
    return response.ok;
  } catch {
    return false;
  }
}

export async function extractOCRText(
  files: PreparedFile[],
  settings: AppSettings,
  signal?: AbortSignal,
): Promise<OCRResponse> {
  const timeoutMs = Math.max(OCR_MIN_TIMEOUT_MS, files.length * OCR_TIMEOUT_PER_FILE_MS);
  const response = await withTimeout(
    fetch(apiUrl('/api/ocr/extract'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ocr: settings.ocr,
        files,
      }),
      signal,
    }),
    timeoutMs,
  );

  if (!response.ok) {
    const text = await response.text();
    let errorMsg = text || 'OCR 请求失败';
    try {
      const json = JSON.parse(text);
      if (json.error) {
        errorMsg = `OCR 错误 [${response.status}]: ${json.error}`;
      }
    } catch {
      errorMsg = `OCR 错误 [${response.status}]: ${text.slice(0, 200)}`;
    }
    throw new Error(errorMsg);
  }

  return (await response.json()) as OCRResponse;
}

function parseSseLine(line: string): string | null {
  if (!line.startsWith('data:')) {
    return null;
  }
  return line.replace(/^data:\s*/, '').trim();
}

export async function streamExtractWords(
  payload: {
    ocrText: string;
    levelTag: string;
    settings: AppSettings;
  },
  onChunk: (word: ExtractedWordDraft) => void,
): Promise<ExtractedWordDraft[]> {
  // LLM 请求可能需要较长时间，设置 2 分钟超时
  const response = await withTimeout(
    fetch(apiUrl('/api/llm/extract'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        llm: payload.settings.llm,
        ocrText: payload.ocrText,
        levelTag: payload.levelTag,
        stream: true,
      }),
    }),
    120000, // 2 分钟
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'LLM 请求失败');
  }

  if (!response.body) {
    return [];
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const words: ExtractedWordDraft[] = [];

  // 添加读取超时机制：60秒内没有收到任何数据则超时
  const READ_TIMEOUT_MS = 60000;
  let timeoutId: number | undefined;
  let timedOut = false;

  const consumeSegment = (segment: string): void => {
    const lines = segment.split('\n');
    for (const line of lines) {
      const payloadText = parseSseLine(line);
      if (!payloadText || payloadText === '[DONE]') {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadText);
      } catch {
        continue;
      }

      if (!parsed || typeof parsed !== 'object') {
        continue;
      }

      const record = parsed as Record<string, unknown>;
      if (record.error) {
        const err = new Error(`LLM 错误: ${String(record.error)}`);
        // Mark thinking-only errors so the caller can skip fallback retry
        if (record.thinkingOnly) {
          (err as Error & { noRetry?: boolean }).noRetry = true;
        }
        throw err;
      }

      if (typeof record.word === 'string') {
        const draft = record as unknown as ExtractedWordDraft;
        words.push(draft);
        onChunk(draft);
      }
    }
  };

  const resetTimeout = (): void => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      timedOut = true;
      void reader.cancel('读取超时').catch(() => {});
    }, READ_TIMEOUT_MS);
  };

  resetTimeout();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // 收到数据，重置超时计时器
      resetTimeout();

      buffer += decoder.decode(value, { stream: true });
      const segments = buffer.split('\n\n');
      buffer = segments.pop() ?? '';

      for (const segment of segments) {
        consumeSegment(segment);
      }
    }

    if (buffer.trim()) {
      consumeSegment(buffer);
    }

    if (timedOut) {
      throw new Error('流式读取超时，请检查网络或 API 配置');
    }
  } catch (error) {
    if (timedOut || (error instanceof Error && error.message.includes('超时'))) {
      throw new Error('流式读取超时，请检查网络或 API 配置');
    }
    throw error;
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }

  return words;
}

export async function streamExtractWordsPipeline(
  payload: {
    ocrText: string;
    levelTag: string;
    settings: AppSettings;
    mode: VocabExtractMode;
    batchSize?: number;
    signal?: AbortSignal;
  },
  onWord: (word: ExtractedWordDraft) => void,
  onEvent?: (event: ExtractPipelineEvent) => void,
): Promise<ExtractPipelineResult> {
  const response = await withTimeout(
    fetch(apiUrl('/api/llm/extract-pipeline'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: payload.signal,
      body: JSON.stringify({
        ocrText: payload.ocrText,
        levelTag: payload.levelTag,
        mode: payload.mode,
        llm: payload.settings.llm,
        smallLlm: payload.settings.smallLlm,
        batchSize: payload.batchSize ?? 5,
      }),
    }),
    300000,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'LLM Pipeline 请求失败');
  }

  if (!response.body) {
    return { words: [], completed: 0, total: 0, failed: 0, failures: [] };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const words: ExtractedWordDraft[] = [];
  let completed = 0;
  let total = 0;
  let failed = 0;
  let failures: PipelineFailure[] = [];

  const READ_TIMEOUT_MS = 120000;
  const MAX_PIPELINE_DURATION_MS = 480000;
  const startTime = Date.now();
  let timeoutId: number | undefined;
  let timedOut = false;
  let lastProgressEventTime = Date.now();

  const consumeSegment = (segment: string): void => {
    const lines = segment.split('\n');
    let hasProgressEvent = false;
    for (const line of lines) {
      const payloadText = parseSseLine(line);
      if (!payloadText || payloadText === '[DONE]') {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadText);
      } catch {
        continue;
      }

      if (!parsed || typeof parsed !== 'object') {
        continue;
      }

      const record = parsed as Record<string, unknown>;
      if (record.error) {
        throw new Error(`LLM 错误: ${String(record.error)}`);
      }

      const event = record as unknown as ExtractPipelineEvent;
      onEvent?.(event);

      if (event.type === 'status') {
        hasProgressEvent = true;
        continue;
      }

      if (event.type === 'word') {
        words.push(event.word);
        completed = event.completed;
        total = event.total;
        failed = event.failed;
        hasProgressEvent = true;
        onWord(event.word);
        continue;
      }

      if (event.type === 'failure') {
        failed = event.failed;
        hasProgressEvent = true;
        continue;
      }

      if (event.type === 'complete') {
        completed = event.completed;
        total = event.total;
        failed = event.failed;
        failures = event.failures ?? [];
        hasProgressEvent = true;
        continue;
      }

      if (event.type === 'structured' || event.type === 'batch') {
        hasProgressEvent = true;
        continue;
      }
    }

    if (hasProgressEvent) {
      lastProgressEventTime = Date.now();
    }
  };

  const checkHeartbeatTimeout = (): void => {
    const elapsedSinceProgress = Date.now() - lastProgressEventTime;
    if (elapsedSinceProgress > READ_TIMEOUT_MS) {
      timedOut = true;
      void reader.cancel('流式读取超时').catch(() => {});
      return;
    }

    const elapsedTotal = Date.now() - startTime;
    if (elapsedTotal > MAX_PIPELINE_DURATION_MS) {
      timedOut = true;
      void reader.cancel('Pipeline 整体超时').catch(() => {});
      return;
    }

    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
    const nextCheckMs = Math.min(
      READ_TIMEOUT_MS - elapsedSinceProgress,
      MAX_PIPELINE_DURATION_MS - elapsedTotal,
    );
    timeoutId = window.setTimeout(checkHeartbeatTimeout, Math.max(nextCheckMs, 5000));
  };

  timeoutId = window.setTimeout(checkHeartbeatTimeout, READ_TIMEOUT_MS);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const segments = buffer.split('\n\n');
      buffer = segments.pop() ?? '';

      for (const segment of segments) {
        consumeSegment(segment);
      }
    }

    if (buffer.trim()) {
      consumeSegment(buffer);
    }

    if (timedOut) {
      const elapsedTotal = Date.now() - startTime;
      if (elapsedTotal > MAX_PIPELINE_DURATION_MS) {
        throw new Error('词汇提取整体超时（超过8分钟），请检查网络或 API 配置');
      }
      throw new Error('流式读取超时（超过2分钟无进展），请检查网络或 API 配置');
    }
  } catch (error) {
    if (timedOut) {
      throw new Error('流式读取超时，请检查网络或 API 配置');
    }
    if (error instanceof Error && error.message.includes('超时')) {
      throw new Error(error.message);
    }
    throw error;
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }

  return { words, completed, total, failed, failures };
}

export async function extractWordsFallback(payload: {
  ocrText: string;
  levelTag: string;
  settings: AppSettings;
}): Promise<ExtractedWordDraft[]> {
  // LLM 请求可能需要较长时间，设置 2 分钟超时
  const response = await withTimeout(
    fetch(apiUrl('/api/llm/extract'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        llm: payload.settings.llm,
        ocrText: payload.ocrText,
        levelTag: payload.levelTag,
        stream: false,
      }),
    }),
    120000, // 2 分钟
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'LLM 请求失败');
  }

  // 服务器现在统一返回 SSE 格式，需要解析
  const text = await response.text();
  const lines = text.split('\n');
  let content = '';

  for (const line of lines) {
    if (line.startsWith('data:')) {
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      if (!parsed || typeof parsed !== 'object') {
        continue;
      }

      const record = parsed as Record<string, unknown>;
      if (record.error) {
        throw new Error(`LLM 错误: ${String(record.error)}`);
      }

      if (typeof record.content === 'string' && record.content.trim()) {
        content = record.content;
      }
    }
  }

  if (!content) {
    const direct = text.trim();
    if (direct) {
      try {
        const parsedDirect = JSON.parse(direct);
        if (Array.isArray(parsedDirect)) {
          return parsedDirect as ExtractedWordDraft[];
        }
      } catch {
        // ignore direct parse fallback
      }
    }
    throw new Error('未能从响应中解析内容');
  }

  const normalized = content.replace(/^```json/, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(normalized);

  if (!Array.isArray(parsed)) {
    throw new Error('LLM 返回非 JSON 数组');
  }

  return parsed as ExtractedWordDraft[];
}

export async function lookupWord(
  word: string,
  settings: AppSettings,
): Promise<ExtractedWordDraft> {
  const response = await withTimeout(
    fetch(apiUrl('/api/llm/lookup'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        llm: settings.llm,
        word,
      }),
    }),
    120000,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'LLM 查询失败');
  }

  const parsed = (await response.json()) as ExtractedWordDraft;
  return parsed;
}

export async function chatWithAI(
  payload: {
    settings: AppSettings;
    messages: Array<Pick<ChatMessage, 'role' | 'content'>>;
    contextWord?: AIAssistantWordContext | null;
  },
  onChunk: (chunk: string) => void,
): Promise<string> {
  const response = await withTimeout(
    fetch(apiUrl('/api/llm/chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        llm: payload.settings.llm,
        messages: payload.messages,
        contextWord: payload.contextWord ?? null,
        stream: true,
      }),
    }),
    120000,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'AI 聊天请求失败');
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';

  const READ_TIMEOUT_MS = 60000;
  let timeoutId: number | undefined;
  let timedOut = false;

  const consumeSegment = (segment: string): void => {
    const lines = segment.split('\n');
    for (const line of lines) {
      const payloadText = parseSseLine(line);
      if (!payloadText || payloadText === '[DONE]') {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadText);
      } catch {
        continue;
      }

      if (!parsed || typeof parsed !== 'object') {
        continue;
      }

      const record = parsed as Record<string, unknown>;
      if (record.error) {
        throw new Error(String(record.error));
      }

      if (typeof record.delta === 'string') {
        content += record.delta;
        onChunk(record.delta);
        continue;
      }

      if (typeof record.content === 'string') {
        const merged = record.content;
        const delta = merged.startsWith(content) ? merged.slice(content.length) : merged;
        if (delta) {
          content += delta;
          onChunk(delta);
        }
      }
    }
  };

  const resetTimeout = (): void => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      timedOut = true;
      void reader.cancel('读取超时').catch(() => undefined);
    }, READ_TIMEOUT_MS);
  };

  resetTimeout();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      resetTimeout();
      buffer += decoder.decode(value, { stream: true });
      const segments = buffer.split('\n\n');
      buffer = segments.pop() ?? '';

      for (const segment of segments) {
        consumeSegment(segment);
      }
    }

    if (buffer.trim()) {
      consumeSegment(buffer);
    }

    if (timedOut) {
      throw new Error('聊天响应超时，请检查网络或 API 配置');
    }
  } catch (error) {
    if (timedOut || (error instanceof Error && error.message.includes('超时'))) {
      throw new Error('聊天响应超时，请检查网络或 API 配置');
    }
    throw error;
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }

  return content;
}

export async function evaluateSentence(payload: {
  settings: AppSettings;
  mode: SentencePracticeMode;
  originalSentence: string;
  userTranslation: string;
  feedbackCriteria: SentenceFeedbackCriterion[];
  aiRole: SentencePracticeAIProfile;
}): Promise<SentenceEvaluationResult> {
  const response = await withTimeout(
    fetch(apiUrl('/api/llm/evaluate-sentence'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        llm: payload.settings.llm,
        mode: payload.mode,
        originalSentence: payload.originalSentence,
        userTranslation: payload.userTranslation,
        feedbackCriteria: payload.feedbackCriteria,
        aiRole: payload.aiRole,
      }),
    }),
    120000,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || '句子评估请求失败');
  }

  const parsed = (await response.json()) as SentenceEvaluationResult;
  return parsed;
}

export async function generateReadingArticle(payload: {
  settings: AppSettings;
  query: string;
  levelTag: string;
  numResults: number;
  targetWordCount: number;
  sourceMode: ReadingSourceMode;
  builtinEngine: ReadingBuiltinEngine;
}): Promise<ReadingArticleResult> {
  const response = await withTimeout(
    fetch(apiUrl('/api/reading/news/generate'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        exa: payload.settings.exa,
        llm: payload.settings.llm,
        query: payload.query,
        levelTag: payload.levelTag,
        numResults: payload.numResults,
        targetWordCount: payload.targetWordCount,
        sourceMode: payload.sourceMode,
        builtinEngine: payload.builtinEngine,
      }),
    }),
    120000,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(extractApiErrorMessage(text, '阅读文章生成失败'));
  }

  return (await response.json()) as ReadingArticleResult;
}

export interface TestConnectionDiagnostic {
  key: string;
  label: string;
  status: 'success' | 'warning' | 'error';
  message: string;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  latency?: number;
  advice?: string;
  diagnostics?: TestConnectionDiagnostic[];
}

const OCR_TEST_IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3Z0l8AAAAASUVORK5CYII=';

function extractApiErrorMessage(rawText: string, fallback: string): string {
  const text = String(rawText || '').trim();
  if (!text) {
    return fallback;
  }

  try {
    const json = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof json.error === 'string' && json.error.trim()) {
      return json.error.trim();
    }
    if (typeof json.message === 'string' && json.message.trim()) {
      return json.message.trim();
    }
  } catch {
    // Keep text fallback for non-JSON responses.
  }

  const cannotPostMatch = text.match(/Cannot\s+POST\s+([^\s<]+)/i);
  if (cannotPostMatch?.[1]) {
    return `后端未找到接口 ${cannotPostMatch[1]}`;
  }

  const normalized = text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || fallback;
}

function normalizeConnectionDiagnostics(value: unknown): TestConnectionDiagnostic[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const diagnostics = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => {
      const rawStatus = item.status;
      const status: TestConnectionDiagnostic['status'] =
        rawStatus === 'success' || rawStatus === 'warning' || rawStatus === 'error'
          ? rawStatus
          : 'warning';

      return {
        key: typeof item.key === 'string' ? item.key : String(item.label || ''),
        label: typeof item.label === 'string' ? item.label : '诊断项',
        status,
        message: typeof item.message === 'string' ? item.message : '',
      };
    })
    .filter((item) => item.label && item.message);

  return diagnostics.length ? diagnostics : undefined;
}

function parseConnectionTestPayload(
  rawText: string,
  fallback: string,
): Pick<TestConnectionResult, 'message' | 'advice' | 'diagnostics'> {
  try {
    const json = JSON.parse(rawText) as {
      message?: unknown;
      advice?: unknown;
      error?: unknown;
      diagnostics?: unknown;
    };

    const message =
      (typeof json.message === 'string' && json.message.trim()) ||
      (typeof json.error === 'string' && json.error.trim()) ||
      fallback;

    return {
      message,
      advice: typeof json.advice === 'string' && json.advice.trim() ? json.advice.trim() : undefined,
      diagnostics: normalizeConnectionDiagnostics(json.diagnostics),
    };
  } catch {
    return {
      message: extractApiErrorMessage(rawText, fallback),
    };
  }
}

function isMissingTestRoute(status: number, bodyText: string, routePath: string): boolean {
  if (status !== 404) {
    return false;
  }

  const lowered = bodyText.toLowerCase();
  return lowered.includes(`cannot post ${routePath.toLowerCase()}`);
}

async function runLegacyLLMConnectionTest(
  settings: AppSettings,
  startTime: number,
): Promise<TestConnectionResult> {
  const response = await withTimeout(
    fetch(apiUrl('/api/llm/lookup'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        llm: settings.llm,
        word: 'hello',
      }),
    }),
    30000,
  );

  const latency = Date.now() - startTime;
  if (!response.ok) {
    const text = await response.text();
    return {
      success: false,
      message: extractApiErrorMessage(text, 'LLM 连接测试失败'),
    };
  }

  return {
    success: true,
    message: 'LLM 连接正常（兼容模式）',
    latency,
  };
}

async function runLegacyOCRConnectionTest(
  settings: AppSettings,
  startTime: number,
): Promise<TestConnectionResult> {
  const response = await withTimeout(
    fetch(apiUrl('/api/ocr/extract'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ocr: settings.ocr,
        files: [
          {
            name: 'probe.png',
            type: 'image/png',
            size: 67,
            base64: OCR_TEST_IMAGE_DATA_URL,
          },
        ],
      }),
    }),
    30000,
  );

  const latency = Date.now() - startTime;
  if (!response.ok) {
    const text = await response.text();
    return {
      success: false,
      message: extractApiErrorMessage(text, 'OCR 连接测试失败'),
    };
  }

  return {
    success: true,
    message: 'OCR 连接正常（兼容模式）',
    latency,
  };
}

export async function testLLMConnection(settings: AppSettings): Promise<TestConnectionResult> {
  const startTime = Date.now();
  try {
    const response = await withTimeout(
      fetch(apiUrl('/api/llm/test'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          llm: settings.llm,
        }),
      }),
      30000, // 30秒超时
    );

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const text = await response.text();
      if (isMissingTestRoute(response.status, text, '/api/llm/test')) {
        return await runLegacyLLMConnectionTest(settings, startTime);
      }

      const payload = parseConnectionTestPayload(text, 'LLM 连接测试失败');
      return { success: false, ...payload };
    }

    const result = await response.json();
    return {
      success: true,
      message: result.message || 'LLM 连接正常',
      latency,
      advice: typeof result.advice === 'string' ? result.advice : undefined,
      diagnostics: normalizeConnectionDiagnostics(result.diagnostics),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '网络请求失败';
    if (message.includes('timeout') || message.includes('超时')) {
      return {
        success: false,
        message: '连接超时，请检查网络或 API 配置',
        diagnostics: [
          { key: 'backend', label: '本地后端', status: 'warning', message: '浏览器已发起请求，但等待响应超时' },
        ],
      };
    }
    if (message.includes('fetch') || message.includes('network')) {
      return {
        success: false,
        message: '网络错误，请检查后端代理是否运行，开发环境请确认 Vite 代理 /api 可访问',
        diagnostics: [
          { key: 'backend', label: '本地后端', status: 'error', message: '浏览器无法访问后端代理' },
        ],
      };
    }
    return { success: false, message };
  }
}

export async function testSmallLLMConnection(settings: AppSettings): Promise<TestConnectionResult> {
  const startTime = Date.now();
  try {
    const response = await withTimeout(
      fetch(apiUrl('/api/llm/test'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          llm: settings.smallLlm,
        }),
      }),
      30000,
    );

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const text = await response.text();
      const payload = parseConnectionTestPayload(text, '小模型连接测试失败');
      return { success: false, ...payload };
    }

    const result = await response.json();
    return {
      success: true,
      message: result.message || '小模型连接正常',
      latency,
      advice: typeof result.advice === 'string' ? result.advice : undefined,
      diagnostics: normalizeConnectionDiagnostics(result.diagnostics),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '网络请求失败';
    if (message.includes('timeout') || message.includes('超时')) {
      return { success: false, message: '连接超时，请检查网络或 API 配置' };
    }
    if (message.includes('fetch') || message.includes('network')) {
      return { success: false, message: '网络错误，请检查后端代理是否运行' };
    }
    return { success: false, message };
  }
}

export async function testOCRConnection(settings: AppSettings): Promise<TestConnectionResult> {
  const startTime = Date.now();
  try {
    const response = await withTimeout(
      fetch(apiUrl('/api/ocr/test'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ocr: settings.ocr,
        }),
      }),
      30000, // 30秒超时
    );

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const text = await response.text();
      if (isMissingTestRoute(response.status, text, '/api/ocr/test')) {
        return await runLegacyOCRConnectionTest(settings, startTime);
      }

      const payload = parseConnectionTestPayload(text, 'OCR 连接测试失败');
      return { success: false, ...payload };
    }

    const result = await response.json();
    return {
      success: true,
      message: result.message || 'OCR 连接正常',
      latency,
      advice: typeof result.advice === 'string' ? result.advice : undefined,
      diagnostics: normalizeConnectionDiagnostics(result.diagnostics),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '网络请求失败';
    if (message.includes('timeout') || message.includes('超时')) {
      return { success: false, message: '连接超时，请检查网络或 API 配置' };
    }
    if (message.includes('fetch') || message.includes('network')) {
      return { success: false, message: '网络错误，请检查后端代理是否运行，开发环境请确认 Vite 代理 /api 可访问' };
    }
    return { success: false, message };
  }
}
