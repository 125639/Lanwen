import { useEffect, useMemo, useState } from 'react';
import { generateReadingArticle } from '../api';
import type { AppSettings, ReadingArticleResult, ReadingBuiltinEngine, ReadingSourceMode, WordCard } from '../types';

interface ReadingPageProps {
  settings: AppSettings;
  activeBookName: string | null;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
  onAddKeyword: (word: Omit<WordCard, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

type ReadingResultSection = 'reading' | 'bilingual' | 'quiz' | 'vocab' | 'sources';

interface ReadingHistoryEntry {
  id: string;
  createdAt: number;
  query: string;
  result: ReadingArticleResult;
}

interface ReadingDraft {
  sourceMode: ReadingSourceMode;
  builtinEngine: ReadingBuiltinEngine;
  mode: 'preset' | 'custom';
  presetTopic: string;
  presetNumResults: number;
  customQuery: string;
  customNumResults: number;
  levelTag: string;
  targetWordCount: number;
}

const STORAGE_KEY = 'linguaflash.reading.draft';
const HISTORY_STORAGE_KEY = 'linguaflash.reading.history';
const PRESET_TOPICS = ['AI 与科技', '全球商业', '教育创新', '健康医疗', '环境与气候', '国际时事'];
const PRESET_NUM_OPTIONS = [3, 5, 8, 10];
const LEVEL_OPTIONS = ['CET4', 'CET6', '考研', '雅思', '托福'];
const WORD_COUNT_OPTIONS = [180, 260, 360, 480, 620];

function clampNumResults(value: number): number {
  if (!Number.isFinite(value)) {
    return 5;
  }
  return Math.max(1, Math.min(20, Math.round(value)));
}

function loadDraft(defaultNumResults: number, defaultLevel: string): ReadingDraft {
  const fallback: ReadingDraft = {
    sourceMode: 'builtin',
    builtinEngine: 'google',
    mode: 'preset',
    presetTopic: PRESET_TOPICS[0],
    presetNumResults: clampNumResults(defaultNumResults),
    customQuery: '',
    customNumResults: clampNumResults(defaultNumResults),
    levelTag: defaultLevel || 'CET6',
    targetWordCount: 360,
  };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<ReadingDraft>;

    const sourceMode = parsed.sourceMode === 'builtin' ? 'builtin' : 'exa';
    const builtinEngine = parsed.builtinEngine === 'bing' ? 'bing' : 'google';
    const mode = parsed.mode === 'custom' ? 'custom' : 'preset';
    const presetTopic =
      typeof parsed.presetTopic === 'string' && parsed.presetTopic.trim()
        ? parsed.presetTopic.trim()
        : fallback.presetTopic;
    const presetNumResults = clampNumResults(Number(parsed.presetNumResults));
    const customQuery = typeof parsed.customQuery === 'string' ? parsed.customQuery : '';
    const customNumResults = clampNumResults(Number(parsed.customNumResults));
    const levelTag =
      typeof parsed.levelTag === 'string' && parsed.levelTag.trim() ? parsed.levelTag.trim() : fallback.levelTag;
    const targetWordCount = Number.isFinite(Number(parsed.targetWordCount))
      ? Math.max(120, Math.min(900, Math.round(Number(parsed.targetWordCount))))
      : fallback.targetWordCount;

    return {
      sourceMode,
      builtinEngine,
      mode,
      presetTopic,
      presetNumResults,
      customQuery,
      customNumResults,
      levelTag,
      targetWordCount,
    };
  } catch {
    return fallback;
  }
}

function loadHistory(): ReadingHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as ReadingHistoryEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => item && typeof item === 'object' && item.result && typeof item.query === 'string');
  } catch {
    return [];
  }
}

function saveHistory(entries: ReadingHistoryEntry[]): void {
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, 20)));
}

export function ReadingPage({ settings, activeBookName, onNotify, onAddKeyword }: ReadingPageProps) {
  const [draft, setDraft] = useState<ReadingDraft>(() =>
    loadDraft(settings.exa.defaultNumResults, settings.defaultLevel),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReadingArticleResult | null>(null);
  const [activeSection, setActiveSection] = useState<ReadingResultSection>('reading');
  const [history, setHistory] = useState<ReadingHistoryEntry[]>(() => loadHistory());
  const [showComposer, setShowComposer] = useState(true);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage errors
    }
  }, [draft]);

  useEffect(() => {
    setDraft((prev) => {
      if (prev.levelTag) {
        return prev;
      }
      return {
        ...prev,
        levelTag: settings.defaultLevel,
      };
    });
  }, [settings.defaultLevel]);

  useEffect(() => {
    if (settings.exa.apiKey.trim()) {
      return;
    }

    setDraft((prev) => {
      if (prev.sourceMode !== 'exa') {
        return prev;
      }

      return {
        ...prev,
        sourceMode: 'builtin',
      };
    });
  }, [settings.exa.apiKey]);

  const effectiveQuery = useMemo(() => {
    if (draft.mode === 'preset') {
      return draft.presetTopic;
    }
    return draft.customQuery.trim();
  }, [draft.customQuery, draft.mode, draft.presetTopic]);

  const effectiveNumResults = useMemo(() => {
    const raw = draft.mode === 'preset' ? draft.presetNumResults : draft.customNumResults;
    return clampNumResults(raw);
  }, [draft.customNumResults, draft.mode, draft.presetNumResults]);

  const effectiveSourceMode =
    draft.sourceMode === 'exa' && !settings.exa.apiKey.trim() ? 'builtin' : draft.sourceMode;

  const requestedBuiltinEngineLabel = draft.builtinEngine === 'bing' ? 'Bing News' : 'Google News';

  const actualBuiltinEngineLabel =
    result?.builtinEngine === 'bing' ? 'Bing News' : result?.builtinEngine === 'google' ? 'Google News' : null;

  const handleGenerate = async () => {
    if (!settings.llm.apiKey.trim()) {
      onNotify('error', '请先在设置里填写 LLM API Key');
      return;
    }

    if (effectiveSourceMode !== draft.sourceMode) {
      setDraft((prev) => ({ ...prev, sourceMode: 'builtin' }));
      onNotify('warning', '未配置 Exa API Key，已自动切换到内置浏览器');
    }

    if (!effectiveQuery) {
      setError('请输入或选择搜索主题');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const generated = await generateReadingArticle({
        settings,
        query: effectiveQuery,
        levelTag: draft.levelTag,
        numResults: effectiveNumResults,
        targetWordCount: draft.targetWordCount,
        sourceMode: effectiveSourceMode,
        builtinEngine: draft.builtinEngine,
      });
      setResult(generated);
      setActiveSection('reading');
      setShowComposer(false);
      setHistory((prev) => {
        const next: ReadingHistoryEntry[] = [
          {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            createdAt: Date.now(),
            query: effectiveQuery,
            result: generated,
          },
          ...prev,
        ].slice(0, 20);
        saveHistory(next);
        return next;
      });
      onNotify('success', `已生成 ${generated.levelTag} 阅读文章`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败';
      setError(message);
      onNotify('error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="reading-page">
      <header className="reading-page-head">
        <h3>新闻阅读工坊</h3>
        <p>用 Exa 或内置新闻搜索抓取来源，再由 AI 整理为分级英语阅读文章。</p>
      </header>

      <section className="reading-panel-shell">
        <button
          type="button"
          className={`tap reading-panel-toggle ${showComposer ? 'open' : ''}`}
          onClick={() => setShowComposer((prev) => !prev)}
        >
          <div>
            <strong>生成设置</strong>
            <span>
              {effectiveSourceMode === 'exa' ? 'Exa 搜索' : requestedBuiltinEngineLabel} · {draft.levelTag} · 约 {draft.targetWordCount} 词
            </span>
          </div>
          <span>{showComposer ? '收起' : '展开'}</span>
        </button>

        {showComposer ? (
          <div className="reading-config-card compact-card">
            <div className="reading-field-block">
              <strong>新闻获取方式</strong>
              <div className="segmented reading-mode-switch">
                <button
                  type="button"
                  className={`tap segmented-item ${effectiveSourceMode === 'exa' ? 'active' : ''}`}
                  onClick={() => setDraft((prev) => ({ ...prev, sourceMode: 'exa' }))}
                  disabled={!settings.exa.apiKey.trim()}
                  title={settings.exa.apiKey.trim() ? '使用 Exa 搜索新闻' : '未配置 Exa API Key，当前不可用'}
                >
                  Exa 搜索
                </button>
                <button
                  type="button"
                  className={`tap segmented-item ${effectiveSourceMode === 'builtin' ? 'active' : ''}`}
                  onClick={() => setDraft((prev) => ({ ...prev, sourceMode: 'builtin' }))}
                >
                  内置浏览器
                </button>
              </div>
              {!settings.exa.apiKey.trim() ? <small className="reading-mode-hint">未配置 Exa API Key，当前默认使用内置浏览器。</small> : null}
            </div>

            {effectiveSourceMode === 'builtin' ? (
              <div className="reading-field-block">
                <strong>内置搜索引擎</strong>
                <div className="segmented reading-mode-switch">
                  <button
                    type="button"
                    className={`tap segmented-item ${draft.builtinEngine === 'google' ? 'active' : ''}`}
                    onClick={() => setDraft((prev) => ({ ...prev, builtinEngine: 'google' }))}
                  >
                    Google News
                  </button>
                  <button
                    type="button"
                    className={`tap segmented-item ${draft.builtinEngine === 'bing' ? 'active' : ''}`}
                    onClick={() => setDraft((prev) => ({ ...prev, builtinEngine: 'bing' }))}
                  >
                    Bing News
                  </button>
                </div>
              </div>
            ) : null}

            <div className="segmented reading-mode-switch">
              <button
                type="button"
                className={`tap segmented-item ${draft.mode === 'preset' ? 'active' : ''}`}
                onClick={() => setDraft((prev) => ({ ...prev, mode: 'preset' }))}
              >
                选项模式
              </button>
              <button
                type="button"
                className={`tap segmented-item ${draft.mode === 'custom' ? 'active' : ''}`}
                onClick={() => setDraft((prev) => ({ ...prev, mode: 'custom' }))}
              >
                自定义模式
              </button>
            </div>

            {draft.mode === 'preset' ? (
              <>
                <div className="reading-field-block">
                  <strong>搜索主题（选项）</strong>
                  <div className="reading-chip-grid">
                    {PRESET_TOPICS.map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        className={`tap reading-chip ${draft.presetTopic === topic ? 'active' : ''}`}
                        onClick={() => setDraft((prev) => ({ ...prev, presetTopic: topic }))}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="reading-field-block">
                  <strong>搜索条数（选项）</strong>
                  <div className="reading-chip-grid compact">
                    {PRESET_NUM_OPTIONS.map((count) => (
                      <button
                        key={count}
                        type="button"
                        className={`tap reading-chip ${draft.presetNumResults === count ? 'active' : ''}`}
                        onClick={() => setDraft((prev) => ({ ...prev, presetNumResults: count }))}
                      >
                        {count} 条
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <label className="reading-field-label">
                  <span>搜索主题（自定义）</span>
                  <input
                    className="setting-input"
                    value={draft.customQuery}
                    onChange={(event) => setDraft((prev) => ({ ...prev, customQuery: event.target.value }))}
                    placeholder="例如：latest AI regulation policy"
                  />
                </label>

                <label className="reading-field-label">
                  <span>搜索条数（1-20）</span>
                  <input
                    className="setting-input"
                    type="number"
                    min={1}
                    max={20}
                    value={draft.customNumResults}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      setDraft((prev) => ({
                        ...prev,
                        customNumResults: Number.isFinite(parsed) ? parsed : prev.customNumResults,
                      }));
                    }}
                  />
                </label>
              </>
            )}

            <label className="reading-field-label">
              <span>阅读等级</span>
              <select
                className="setting-select"
                value={draft.levelTag}
                onChange={(event) => setDraft((prev) => ({ ...prev, levelTag: event.target.value }))}
              >
                {LEVEL_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>

            <div className="reading-field-block">
              <strong>文章长度</strong>
              <div className="reading-chip-grid compact">
                {WORD_COUNT_OPTIONS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={`tap reading-chip ${draft.targetWordCount === count ? 'active' : ''}`}
                    onClick={() => setDraft((prev) => ({ ...prev, targetWordCount: count }))}
                  >
                    约 {count} 词
                  </button>
                ))}
              </div>
            </div>

            <div className="reading-submit-row compact-submit-row">
              <button type="button" className="tap primary-btn full" disabled={loading} onClick={() => void handleGenerate()}>
                {loading ? '生成中...' : '生成阅读文章'}
              </button>
            </div>

            {error ? (
              <div className="status-card status-error">
                <div className="status-icon">⚠️</div>
                <div>
                  <strong>生成失败</strong>
                  <p>{error}</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="reading-toolbar-row">
        <button
          type="button"
          className="tap secondary-btn reading-toolbar-btn"
          onClick={() => setShowHistoryDrawer(true)}
        >
          历史记录
          <span>{history.length ? `${history.length} 条` : '空'}</span>
        </button>
      </div>

      <section className="reading-history-card">
        <div className="reading-history-head">
          <div>
            <h4>历史记录</h4>
            <p>可回看之前生成的阅读内容，也可以手动删除。</p>
          </div>
          {history.length ? (
            <button
              type="button"
              className="tap ghost-btn"
              onClick={() => {
                setHistory([]);
                saveHistory([]);
                onNotify('info', '已清空阅读历史');
              }}
            >
              清空
            </button>
          ) : null}
        </div>

        {history.length ? (
          <div className="reading-history-list">
            {history.map((entry) => (
              <div key={entry.id} className="reading-history-item">
                <button
                  type="button"
                  className="tap reading-history-main"
                  onClick={() => {
                    setResult(entry.result);
                    setActiveSection('reading');
                    onNotify('info', '已打开历史记录');
                  }}
                >
                  <strong>{entry.result.title}</strong>
                  <span>
                    {entry.query} · {entry.result.levelTag} · {entry.result.wordCount} 词
                  </span>
                  <small>{new Date(entry.createdAt).toLocaleString('zh-CN')}</small>
                </button>
                <button
                  type="button"
                  className="tap danger-btn reading-history-delete"
                  onClick={() => {
                    setHistory((prev) => {
                      const next = prev.filter((item) => item.id !== entry.id);
                      saveHistory(next);
                      return next;
                    });

                    if (result?.title === entry.result.title && result?.query === entry.result.query) {
                      setResult(null);
                    }

                    onNotify('success', '已删除该条历史记录');
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="reading-history-empty">还没有历史记录，生成一篇阅读文章后会自动保存到这里。</div>
        )}
      </section>

      {result ? (
        <article className="reading-result-card">
          <header className="reading-result-head">
            <h4>{result.title}</h4>
            <span>
              {result.levelTag} · 实际 {result.wordCount} 词 / 目标 {result.requestedWordCount ?? draft.targetWordCount} 词 ·{' '}
              {result.sourceMode === 'exa'
                ? 'Exa'
                : `内置浏览器 / ${result.requestedBuiltinEngine === 'bing' ? 'Bing News' : result.requestedBuiltinEngine === 'google' ? 'Google News' : requestedBuiltinEngineLabel}`}
            </span>
          </header>

          {result.sourceMode === 'builtin' ? (
            <div className={`status-card ${result.builtinFallbackApplied ? 'status-info' : 'status-loading'}`}>
              <div className="status-icon">{result.builtinFallbackApplied ? '↪️' : '📰'}</div>
              <div>
                <strong>
                  {result.builtinFallbackApplied
                    ? 'Bing 暂无结果，已自动切换新闻源'
                    : '新闻源获取成功'}
                </strong>
                <p>
                  你选择的是{' '}
                  {result.requestedBuiltinEngine === 'bing'
                    ? 'Bing News'
                    : result.requestedBuiltinEngine === 'google'
                      ? 'Google News'
                      : requestedBuiltinEngineLabel}
                  。
                  {result.builtinFallbackApplied && actualBuiltinEngineLabel
                    ? ` 实际使用 ${actualBuiltinEngineLabel} 生成了本次阅读内容。`
                    : actualBuiltinEngineLabel
                      ? ` 本次实际使用 ${actualBuiltinEngineLabel} 作为新闻来源。`
                      : ''}
                </p>
              </div>
            </div>
          ) : null}

          <div className="reading-result-layout">
            <aside className="reading-result-sidebar">
              <div className="reading-section-tabs" role="tablist" aria-label="阅读结果分区">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSection === 'reading'}
                  className={`tap reading-section-tab ${activeSection === 'reading' ? 'active' : ''}`}
                  onClick={() => setActiveSection('reading')}
                >
                  阅读
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSection === 'bilingual'}
                  className={`tap reading-section-tab ${activeSection === 'bilingual' ? 'active' : ''}`}
                  onClick={() => setActiveSection('bilingual')}
                >
                  对照
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSection === 'quiz'}
                  className={`tap reading-section-tab ${activeSection === 'quiz' ? 'active' : ''}`}
                  onClick={() => setActiveSection('quiz')}
                >
                  练习
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSection === 'vocab'}
                  className={`tap reading-section-tab ${activeSection === 'vocab' ? 'active' : ''}`}
                  onClick={() => setActiveSection('vocab')}
                >
                  词汇
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSection === 'sources'}
                  className={`tap reading-section-tab ${activeSection === 'sources' ? 'active' : ''}`}
                  onClick={() => setActiveSection('sources')}
                >
                  来源
                </button>
              </div>

              <div className="reading-sidebar-note">
                <strong>
                  {activeSection === 'reading' && '先读英文正文'}
                  {activeSection === 'bilingual' && '再看中英对照'}
                  {activeSection === 'quiz' && '最后做阅读练习'}
                  {activeSection === 'vocab' && '补充重点词汇'}
                  {activeSection === 'sources' && '回看原始来源'}
                </strong>
                <p>
                  {activeSection === 'reading' && '正文区域现在占据主要宽度，更适合连续阅读。'}
                  {activeSection === 'bilingual' && '逐段对照理解文章内容，不用在长页面里反复来回滚动。'}
                  {activeSection === 'quiz' && '题目与答案放在独立区域，做题时不会被正文和词汇打断。'}
                  {activeSection === 'vocab' && '词汇卡片集中显示，适合看完文章后再快速复习。'}
                  {activeSection === 'sources' && '需要核对事实或继续延伸阅读时，再进入来源区。'}
                </p>
              </div>
            </aside>

            <div className="reading-result-main">
              {activeSection === 'reading' ? (
                <section className="reading-stage-panel">
                  <div className="reading-stage-intro">
                    <strong>英文正文</strong>
                    <p>先专注阅读英文内容，再切换到对照或练习区继续学习。</p>
                  </div>
                  <div className="reading-article-body reading-article-body--primary">
                    {result.article
                      .split(/\n{2,}/)
                      .map((paragraph) => paragraph.trim())
                      .filter(Boolean)
                      .map((paragraph, index) => (
                        <p key={`${paragraph.slice(0, 12)}-${index}`}>{paragraph}</p>
                      ))}
                  </div>
                </section>
              ) : null}

              {activeSection === 'bilingual' && result.articleZh ? (
                <section className="reading-translation-section">
                  <div className="reading-stage-intro">
                    <strong>中英对照</strong>
                    <p>逐段对照理解原文表达和中文含义。</p>
                  </div>
                  <h5>中英对照</h5>
                  <div className="reading-bilingual-grid">
                    {result.article
                      .split(/\n{2,}/)
                      .map((paragraph) => paragraph.trim())
                      .filter(Boolean)
                      .map((paragraph, index) => {
                        const translated = result.articleZh
                          .split(/\n{2,}/)
                          .map((item: string) => item.trim())
                          .filter(Boolean)[index];

                        return (
                          <div key={`${paragraph.slice(0, 12)}-bilingual-${index}`} className="reading-bilingual-card">
                            <p className="reading-bilingual-en">{paragraph}</p>
                            <p className="reading-bilingual-zh">{translated || '暂无对应翻译。'}</p>
                          </div>
                        );
                      })}
                  </div>
                </section>
              ) : null}

              {activeSection === 'vocab' && result.keywords.length ? (
                <section className="reading-keywords-section">
                  <div className="reading-stage-intro">
                    <strong>重点词汇</strong>
                    <p>
                      先掌握关键词，再回到文章复读效果会更好。
                      {activeBookName ? ` 也可以直接加入当前词书「${activeBookName}」。` : ''}
                    </p>
                  </div>
                  <h5>重点词汇</h5>
                  <div className="reading-keyword-grid">
                    {result.keywords.map((item) => (
                      <div key={item.word} className="reading-keyword-card">
                        <strong>{item.word}</strong>
                        <p>{item.meaning_zh}</p>
                        <small>{item.example_en}</small>
                        <small>{item.example_zh}</small>
                        <button
                          type="button"
                          className="tap reading-keyword-add-btn"
                          onClick={() =>
                            void onAddKeyword({
                              word: item.word,
                              phonetic_uk: '',
                              phonetic_us: '',
                              pos: 'n.',
                              meaning_brief: item.meaning_zh,
                              meaning_collins: item.meaning_zh,
                              meaning_advanced: [],
                              word_forms: {},
                              level_tag: [result.levelTag],
                              origin_sentence: item.example_en,
                              origin_translation: item.example_zh,
                              ai_example_en: item.example_en,
                              ai_example_zh: item.example_zh,
                              synonyms: [],
                              antonyms: [],
                              related: [],
                              mnemonic: `来自阅读文章《${result.title}》的关键词`,
                              favorited: false,
                              masteryLevel: 0,
                              wrongCount: 0,
                            })
                          }
                        >
                          加入当前词书
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeSection === 'quiz' && result.questions.length ? (
                <section className="reading-qa-section">
                  <div className="reading-stage-intro">
                    <strong>阅读练习</strong>
                    <p>完成题目，检查自己是否真正理解了文章核心信息。</p>
                  </div>
                  <h5>阅读理解</h5>
                  {result.questions.map((item, index) => (
                    <div key={`${item.question}-${index}`} className="reading-question-card">
                      <p className="reading-question-title">
                        {index + 1}. {item.question}
                      </p>
                      <ul className="reading-options-list">
                        {item.options.map((option) => (
                          <li key={option}>{option}</li>
                        ))}
                      </ul>
                      <p className="reading-answer">答案：{item.answer}</p>
                      <p className="reading-explanation">解析：{item.explanation_zh}</p>
                    </div>
                  ))}
                </section>
              ) : null}

              {activeSection === 'sources' && result.sources.length ? (
                <section className="reading-source-section">
                  <div className="reading-stage-intro">
                    <strong>新闻来源</strong>
                    <p>需要核对事实或继续延伸阅读时，可以从这里回到原始新闻。</p>
                  </div>
                  <h5>新闻来源</h5>
                  <ul className="reading-source-list">
                    {result.sources.map((source) => (
                      <li key={source.url}>
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.title || source.url}
                        </a>
                        {source.publishedDate ? <small>{source.publishedDate}</small> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
        </article>
      ) : null}

      {showHistoryDrawer ? (
        <div className="modal-backdrop" onClick={() => setShowHistoryDrawer(false)}>
          <aside className="reading-history-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="reading-history-head">
              <div>
                <h4>阅读历史</h4>
                <p>可回看之前生成的阅读内容，也可以手动删除。</p>
              </div>
              <div className="reading-history-actions">
                {history.length ? (
                  <button
                    type="button"
                    className="tap ghost-btn"
                    onClick={() => {
                      setHistory([]);
                      saveHistory([]);
                      setResult(null);
                      onNotify('info', '已清空阅读历史');
                    }}
                  >
                    清空
                  </button>
                ) : null}
                <button type="button" className="tap top-nav-icon-btn" onClick={() => setShowHistoryDrawer(false)}>
                  ×
                </button>
              </div>
            </div>

            {history.length ? (
              <div className="reading-history-list">
                {history.map((entry) => (
                  <div key={entry.id} className="reading-history-item">
                    <button
                      type="button"
                      className="tap reading-history-main"
                      onClick={() => {
                        setResult(entry.result);
                        setActiveSection('reading');
                        setShowComposer(false);
                        setShowHistoryDrawer(false);
                        onNotify('info', '已打开历史记录');
                      }}
                    >
                      <strong>{entry.result.title}</strong>
                      <span>
                        {entry.query} · {entry.result.levelTag} · {entry.result.wordCount} 词
                      </span>
                      <small>{new Date(entry.createdAt).toLocaleString('zh-CN')}</small>
                    </button>
                    <button
                      type="button"
                      className="tap danger-btn reading-history-delete"
                      onClick={() => {
                        setHistory((prev) => {
                          const next = prev.filter((item) => item.id !== entry.id);
                          saveHistory(next);
                          return next;
                        });

                        if (result?.title === entry.result.title && result?.query === entry.result.query) {
                          setResult(null);
                        }

                        onNotify('success', '已删除该条历史记录');
                      }}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="reading-history-empty">还没有历史记录，生成一篇阅读文章后会自动保存到这里。</div>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
