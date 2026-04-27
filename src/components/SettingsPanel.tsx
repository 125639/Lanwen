import { useEffect, useState, type CSSProperties } from 'react';
import { testLLMConnection, testOCRConnection, type TestConnectionDiagnostic } from '../api';
import { matchesMediaQuery, subscribeToMediaQuery } from '../browser';
import { DEFAULT_SETTINGS, saveSettings } from '../settings';
import type {
  AppSettings,
  SentenceFeedbackCriterion,
  SettingsGroup,
  ThemePreset,
  VocabExtractMode,
} from '../types';

interface SettingsPanelProps {
  settings: AppSettings;
  initialGroup?: SettingsGroup;
  highlightModel?: boolean;
  highlightExa?: boolean;
  highlightOcr?: boolean;
  onSettingsChange: (settings: AppSettings) => void;
  onClose: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onResetData: () => void;
  notify?: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
}

type LlmProvider = AppSettings['llm']['provider'];

const LLM_PROVIDER_PRESETS: Record<Exclude<LlmProvider, 'custom'>, { baseUrl: string; model: string }> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  openai: {
    baseUrl: 'https://api.openai.com',
    model: 'gpt-4o-mini',
  },
  zhipu: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
  },
};

const GROUPS: Array<{ key: SettingsGroup; label: string; icon: React.ReactNode }> = [
  {
    key: 'general',
    label: '通用设置',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    key: 'goals',
    label: '学习目标',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
  },
  {
    key: 'learn',
    label: '背词模式',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    key: 'model',
    label: '模型配置',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
        <rect x="9" y="9" width="6" height="6" />
        <line x1="9" y1="1" x2="9" y2="4" />
        <line x1="15" y1="1" x2="15" y2="4" />
        <line x1="9" y1="20" x2="9" y2="23" />
        <line x1="15" y1="20" x2="15" y2="23" />
        <line x1="20" y1="9" x2="23" y2="9" />
        <line x1="20" y1="14" x2="23" y2="14" />
        <line x1="1" y1="9" x2="4" y2="9" />
        <line x1="1" y1="14" x2="4" y2="14" />
      </svg>
    ),
  },
  {
    key: 'exa',
    label: 'Exa 搜索',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15 15 0 0 1 0 20" />
        <path d="M12 2a15 15 0 0 0 0 20" />
      </svg>
    ),
  },
  {
    key: 'ocr',
    label: 'OCR',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
  {
    key: 'speech',
    label: '发音',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    ),
  },
  {
    key: 'appearance',
    label: '外观',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13.5" cy="6.5" r="2.5" />
        <path d="M17.3 20.3a2.4 2.4 0 0 0 .7-3.2L13.5 9.5 9 17.1a2.4 2.4 0 0 0 .7 3.2 9.8 9.8 0 0 0 7.6 0z" />
      </svg>
    ),
  },
  {
    key: 'data',
    label: '数据管理',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
  {
    key: 'about',
    label: '关于',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
];

const SENTENCE_FEEDBACK_OPTIONS: Array<{
  key: SentenceFeedbackCriterion;
  label: string;
}> = [
  { key: 'grammar', label: '语法正确性' },
  { key: 'vocabulary', label: '用词准确性' },
  { key: 'semantic', label: '语义相似度' },
  { key: 'improvement', label: '改进建议' },
  { key: 'score', label: '总分(0-100)' },
];

const VOCAB_EXTRACT_MODE_OPTIONS: Array<{
  value: VocabExtractMode;
  label: string;
  description: string;
}> = [
  {
    value: 'large_structure_small_enrich',
    label: '大模型整理 + 小模型加工',
    description: '默认模式：先还原教材结构，再逐词补全词卡。',
  },
  {
    value: 'large_only',
    label: '大模型全包揽',
    description: '从 OCR 文本直接生成完整词卡，适合上下文较长的材料。',
  },
  {
    value: 'small_only',
    label: '小模型全流程',
    description: '低成本模式，小模型先整理再逐词补全；若超时会自动尝试同系列更稳型号。',
  },
];

const THEME_MODE_OPTIONS: Array<{
  value: AppSettings['theme'];
  label: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'light',
    label: '浅色',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: '深色',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
  {
    value: 'auto',
    label: '跟随系统',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
];

const THEME_PRESET_OPTIONS: Array<{
  value: ThemePreset;
  label: string;
  description: string;
  preview: {
    background: string;
    glow: string;
    surface: string;
    accent: string;
    line: string;
  };
}> = [
  {
    value: 'classic',
    label: '原生蓝',
    description: '默认主题，稳重清爽，适合日常高频使用',
    preview: {
      background: 'linear-gradient(135deg, #EEF2FF 0%, #DBEAFE 45%, #E0E7FF 100%)',
      glow: 'rgba(99, 102, 241, 0.42)',
      surface: 'rgba(255, 255, 255, 0.92)',
      accent: '#6366F1',
      line: 'rgba(15, 23, 42, 0.14)',
    },
  },
  {
    value: 'mist',
    label: '简约版',
    description: '暖白留白和低噪边界，适合长时间阅读与背词',
    preview: {
      background:
        'radial-gradient(circle at 18% 12%, rgba(69, 104, 131, 0.14), transparent 28%), linear-gradient(180deg, #F7F3EC 0%, #F2EEE6 56%, #EBE6DC 100%)',
      glow: 'rgba(39, 68, 93, 0.18)',
      surface: 'rgba(255, 253, 248, 0.94)',
      accent: '#27445D',
      line: 'rgba(39, 68, 93, 0.12)',
    },
  },
  {
    value: 'pulse',
    label: '科技感',
    description: '冷光网格和霓虹描边更强，整体更偏未来感',
    preview: {
      background:
        'radial-gradient(circle at 14% 18%, rgba(103, 232, 255, 0.34), transparent 24%), radial-gradient(circle at 82% 12%, rgba(8, 197, 255, 0.2), transparent 28%), linear-gradient(145deg, #F1FAFF 0%, #D7EDFF 46%, #EDF9FF 100%)',
      glow: 'rgba(8, 197, 255, 0.34)',
      surface: 'rgba(245, 250, 255, 0.8)',
      accent: '#08C5FF',
      line: 'rgba(4, 30, 58, 0.18)',
    },
  },
];

function SettingsItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={className ? `setting-item ${className}` : 'setting-item'}>{children}</div>;
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={`tap segmented-item ${value === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`tap toggle-switch ${checked ? 'on' : ''}`}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onChange(!checked);
        }
      }}
    >
      <span />
    </button>
  );
}

function stepFloat(value: number, delta: number, min: number, max: number): number {
  const next = Math.round((value + delta) * 100) / 100;
  return Math.min(max, Math.max(min, next));
}

function MiniPreviewCard({ motionEnabled }: { motionEnabled: boolean }) {
  return (
    <div className={`appearance-preview ${motionEnabled ? 'motion-on' : 'motion-off'}`}>
      <div className="appearance-preview-topline">
        <span className="appearance-preview-chip" />
        <span className="appearance-preview-chip secondary" />
      </div>
      <div className="mini-word">dispatch</div>
      <div className="mini-phonetic">/dɪˈspætʃ/</div>
      <div className="mini-line" />
      <div className="mini-line short" />
      <div className="motion-preview-rail" aria-hidden="true">
        <span className="motion-preview-dot" />
        <span className="motion-preview-dot secondary" />
      </div>
      <div className="mini-pill-row">
        <span className="mini-pill" />
        <span className="mini-pill faint" />
      </div>
    </div>
  );
}

function ThemePresetPreview({
  preview,
}: {
  preview: {
    background: string;
    glow: string;
    surface: string;
    accent: string;
    line: string;
  };
}) {
  const style = {
    '--theme-preview-bg': preview.background,
    '--theme-preview-glow': preview.glow,
    '--theme-preview-surface': preview.surface,
    '--theme-preview-accent': preview.accent,
    '--theme-preview-line': preview.line,
  } as CSSProperties;

  return (
    <div className="theme-preset-preview" style={style}>
      <div className="theme-preset-preview-bar">
        <span />
        <span />
        <span />
      </div>
      <div className="theme-preset-preview-pill" />
      <div className="theme-preset-preview-panel">
        <div className="theme-preset-preview-title" />
        <div className="theme-preset-preview-line" />
        <div className="theme-preset-preview-line short" />
      </div>
    </div>
  );
}

function SelectMenu<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="select-menu">
      <button type="button" className="tap select-trigger" onClick={() => setOpen((prev) => !prev)}>
        <span>{current?.label}</span>
        <span>⌄</span>
      </button>
      {open ? (
        <div className="select-dropdown">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`tap select-option ${option.value === value ? 'active' : ''}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getDiagnosticStatusText(status: TestConnectionDiagnostic['status']): string {
  if (status === 'success') return '正常';
  if (status === 'error') return '失败';
  return '注意';
}

export function SettingsPanel({
  settings,
  initialGroup,
  highlightModel,
  highlightExa,
  highlightOcr,
  onSettingsChange,
  onClose,
  onExport,
  onImport,
  onResetData,
  notify,
}: SettingsPanelProps) {
  const [group, setGroup] = useState<SettingsGroup>(initialGroup ?? 'general');
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [showSmallLlmKey, setShowSmallLlmKey] = useState(false);
  const [showExaKey, setShowExaKey] = useState(false);
  const [showOcrKey, setShowOcrKey] = useState(false);
  const [showAzureKey, setShowAzureKey] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => matchesMediaQuery('(min-width: 768px)'));
  const [showAdvancedLearn, setShowAdvancedLearn] = useState(false);

  // Test connection states
  const [llmTestStatus, setLlmTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [llmTestMessage, setLlmTestMessage] = useState('');
  const [llmTestAdvice, setLlmTestAdvice] = useState('');
  const [llmDiagnostics, setLlmDiagnostics] = useState<TestConnectionDiagnostic[]>([]);
  const [showLlmDiagnostics, setShowLlmDiagnostics] = useState(false);
  const [ocrTestStatus, setOcrTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [ocrTestMessage, setOcrTestMessage] = useState('');

  const handleTestLLM = async () => {
    if (!settings.llm.apiKey) {
      setLlmTestStatus('error');
      setLlmTestMessage('请先填写 API Key');
      setLlmTestAdvice('');
      setLlmDiagnostics([]);
      return;
    }
    setLlmTestStatus('testing');
    setLlmTestMessage('测试中...');
    setLlmTestAdvice('');
    setLlmDiagnostics([]);
    setShowLlmDiagnostics(false);
    const result = await testLLMConnection(settings);
    setLlmTestStatus(result.success ? 'success' : 'error');
    setLlmTestMessage(result.success && result.latency ? `${result.message} (${result.latency}ms)` : result.message);
    setLlmTestAdvice(result.advice ?? '');
    setLlmDiagnostics(result.diagnostics ?? []);
  };

  const handleTestOCR = async () => {
    if (!settings.ocr.apiKey) {
      setOcrTestStatus('error');
      setOcrTestMessage('请先填写 API Key');
      return;
    }
    setOcrTestStatus('testing');
    setOcrTestMessage('测试中...');
    const result = await testOCRConnection(settings);
    setOcrTestStatus(result.success ? 'success' : 'error');
    setOcrTestMessage(result.success && result.latency ? `${result.message} (${result.latency}ms)` : result.message);
  };

  useEffect(() => {
    if (initialGroup) {
      setGroup(initialGroup);
    }
  }, [initialGroup]);

  useEffect(() => {
    return subscribeToMediaQuery('(min-width: 768px)', setIsDesktop);
  }, []);

  const patchSettings = (partial: Partial<AppSettings>) => {
    const updated = saveSettings(partial);
    onSettingsChange(updated);
  };

  const patchLlmProvider = (provider: LlmProvider) => {
    const current = settings.llm;
    const previousPreset = current.provider === 'custom' ? null : LLM_PROVIDER_PRESETS[current.provider];
    const nextPreset = provider === 'custom' ? null : LLM_PROVIDER_PRESETS[provider];
    const currentBaseUrl = current.baseUrl.trim();
    const currentModel = current.model.trim();
    const knownPresets = Object.values(LLM_PROVIDER_PRESETS);
    const isKnownPresetBaseUrl = knownPresets.some((preset) => preset.baseUrl === currentBaseUrl);
    const isKnownPresetModel = knownPresets.some((preset) => preset.model === currentModel);

    patchSettings({
      llm: {
        ...current,
        provider,
        baseUrl:
          nextPreset && (!currentBaseUrl || currentBaseUrl === previousPreset?.baseUrl || isKnownPresetBaseUrl)
            ? nextPreset.baseUrl
            : current.baseUrl,
        model:
          nextPreset && (!currentModel || currentModel === previousPreset?.model || isKnownPresetModel)
            ? nextPreset.model
            : current.model,
      },
    });
  };

  const patchSmallLlmProvider = (provider: LlmProvider) => {
    const current = settings.smallLlm;
    const previousPreset = current.provider === 'custom' ? null : LLM_PROVIDER_PRESETS[current.provider];
    const nextPreset = provider === 'custom' ? null : LLM_PROVIDER_PRESETS[provider];
    const currentBaseUrl = current.baseUrl.trim();
    const currentModel = current.model.trim();
    const knownPresets = Object.values(LLM_PROVIDER_PRESETS);
    const isKnownPresetBaseUrl = knownPresets.some((preset) => preset.baseUrl === currentBaseUrl);
    const isKnownPresetModel = knownPresets.some((preset) => preset.model === currentModel);

    patchSettings({
      smallLlm: {
        ...current,
        provider,
        baseUrl:
          nextPreset && (!currentBaseUrl || currentBaseUrl === previousPreset?.baseUrl || isKnownPresetBaseUrl)
            ? nextPreset.baseUrl
            : current.baseUrl,
        model:
          nextPreset && (!currentModel || currentModel === previousPreset?.model || isKnownPresetModel)
            ? nextPreset.model
            : current.model,
      },
    });
  };

  const patchSm2 = (partial: Partial<AppSettings['sm2']>) => {
    patchSettings({
      sm2: {
        ...settings.sm2,
        ...partial,
      },
    });
  };

  const patchSentencePractice = (partial: Partial<AppSettings['sentencePractice']>) => {
    patchSettings({
      sentencePractice: {
        ...settings.sentencePractice,
        ...partial,
      },
    });
  };

  const handleToggleSentenceCriterion = (criterion: SentenceFeedbackCriterion) => {
    const current = settings.sentencePractice.feedbackCriteria;
    const exists = current.includes(criterion);

    const next = exists ? current.filter((item) => item !== criterion) : [...current, criterion];

    patchSentencePractice({
      feedbackCriteria: next.length ? next : [criterion],
    });
  };

  const groupContent = (
    <div className="settings-panel-content settings-panel-enter settings-panel-enter-active">
      {group === 'general' ? (
        <section>
          <div className="setting-group-title">通用设置</div>
          <div className="setting-group">
            <SettingsItem className="setting-item-stack">
              <div>
                <strong>显示模式</strong>
                <div className="setting-hint">控制浅色、深色或跟随系统</div>
              </div>
              <div className="theme-cards">
                {THEME_MODE_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    className={`tap theme-card ${settings.theme === opt.value ? 'active' : ''}`}
                    onClick={() => patchSettings({ theme: opt.value })}
                  >
                    <span className="theme-card-icon">{opt.icon}</span>
                    <span className="theme-card-label">{opt.label}</span>
                  </button>
                ))}
              </div>
            </SettingsItem>

            <SettingsItem className="setting-item-stack">
              <div>
                <strong>界面主题</strong>
                <div className="setting-hint">切换主色和背景层次，不影响上传、背词、测试与词库功能</div>
              </div>
              <div className="theme-preset-grid">
                {THEME_PRESET_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={`tap theme-preset-card ${
                      settings.appearance.preset === option.value ? 'active' : ''
                    }`}
                    onClick={() =>
                      patchSettings({
                        appearance: {
                          ...settings.appearance,
                          preset: option.value,
                        },
                      })
                    }
                  >
                    <ThemePresetPreview preview={option.preview} />
                    <div className="theme-preset-copy">
                      <span className="theme-preset-title">{option.label}</span>
                      <span className="theme-preset-note">{option.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>AI 助手开关</strong>
                <div className="setting-hint">全局悬浮入口，支持上下文问答</div>
              </div>
              <ToggleSwitch
                checked={settings.aiAssistant.enabled}
                onChange={(enabled) =>
                  patchSettings({
                    aiAssistant: {
                      ...settings.aiAssistant,
                      enabled,
                    },
                  })
                }
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>AI 助手显示模式</strong>
              </div>
              <Segmented
                options={[
                  { label: '显性显示', value: 'visible' },
                  { label: '隐形显示', value: 'hidden' },
                ]}
                value={settings.aiAssistant.displayMode}
                onChange={(displayMode) =>
                  patchSettings({
                    aiAssistant: {
                      ...settings.aiAssistant,
                      displayMode,
                    },
                  })
                }
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>语言</strong>
              </div>
              <SelectMenu
                value={settings.language}
                options={[
                  { label: '中文', value: 'zh-CN' },
                  { label: 'English', value: 'en-US' },
                ]}
                onChange={(value) => patchSettings({ language: value })}
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>默认等级</strong>
              </div>
              <SelectMenu
                value={settings.defaultLevel}
                options={[
                  { label: 'CET4', value: 'CET4' },
                  { label: 'CET6', value: 'CET6' },
                  { label: '考研', value: '考研' },
                  { label: '雅思', value: '雅思' },
                  { label: '托福', value: '托福' },
                ]}
                onChange={(value) => patchSettings({ defaultLevel: value })}
              />
            </SettingsItem>
          </div>
        </section>
      ) : null}

      {group === 'goals' ? (
        <section>
          <div className="setting-group-title">每日目标</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>每日新词目标</strong>
              </div>
              <div className="goal-stepper">
                <button
                  type="button"
                  className="tap ghost-btn"
                  onClick={() =>
                    patchSettings({
                      goals: {
                        ...settings.goals,
                        dailyNewWords: Math.max(1, settings.goals.dailyNewWords - 1),
                      },
                    })
                  }
                >
                  -
                </button>
                <strong>{settings.goals.dailyNewWords}</strong>
                <button
                  type="button"
                  className="tap ghost-btn"
                  onClick={() =>
                    patchSettings({
                      goals: {
                        ...settings.goals,
                        dailyNewWords: Math.min(50, settings.goals.dailyNewWords + 1),
                      },
                    })
                  }
                >
                  +
                </button>
              </div>
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>每日复习目标</strong>
              </div>
              <div className="goal-stepper">
                <button
                  type="button"
                  className="tap ghost-btn"
                  onClick={() =>
                    patchSettings({
                      goals: {
                        ...settings.goals,
                        dailyReviewWords: Math.max(1, settings.goals.dailyReviewWords - 1),
                      },
                    })
                  }
                >
                  -
                </button>
                <strong>{settings.goals.dailyReviewWords}</strong>
                <button
                  type="button"
                  className="tap ghost-btn"
                  onClick={() =>
                    patchSettings({
                      goals: {
                        ...settings.goals,
                        dailyReviewWords: Math.min(50, settings.goals.dailyReviewWords + 1),
                      },
                    })
                  }
                >
                  +
                </button>
              </div>
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>打卡提醒时间</strong>
              </div>
              <input
                type="time"
                className="setting-input"
                value={settings.goals.reminderTime}
                onChange={(event) =>
                  patchSettings({ goals: { ...settings.goals, reminderTime: event.target.value } })
                }
              />
            </SettingsItem>
          </div>
        </section>
      ) : null}

      {group === 'learn' ? (
        <section>
          <div className="setting-group-title">背词设置</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>每组单词数</strong>
              </div>
              <div className="goal-stepper">
                <button
                  type="button"
                  className="tap ghost-btn"
                  onClick={() =>
                    patchSettings({
                      learn: {
                        ...settings.learn,
                        groupSize: Math.max(5, settings.learn.groupSize - 5),
                      },
                    })
                  }
                >
                  -
                </button>
                <strong>{settings.learn.groupSize}</strong>
                <button
                  type="button"
                  className="tap ghost-btn"
                  onClick={() =>
                    patchSettings({
                      learn: {
                        ...settings.learn,
                        groupSize: Math.min(50, settings.learn.groupSize + 5),
                      },
                    })
                  }
                >
                  +
                </button>
              </div>
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>拼写测试</strong>
                <div className="setting-hint">背词结束后进行拼写测试</div>
              </div>
              <ToggleSwitch
                checked={settings.learn.spellingTest}
                onChange={(spellingTest) =>
                  patchSettings({ learn: { ...settings.learn, spellingTest } })
                }
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>首字母提示</strong>
                <div className="setting-hint">拼写测试时显示首字母</div>
              </div>
              <ToggleSwitch
                checked={settings.learn.firstLetterHint}
                onChange={(firstLetterHint) =>
                  patchSettings({ learn: { ...settings.learn, firstLetterHint } })
                }
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>最大复习轮次</strong>
              </div>
              <div className="goal-stepper">
                <button
                  type="button"
                  className="tap ghost-btn"
                  onClick={() =>
                    patchSettings({
                      learn: {
                        ...settings.learn,
                        maxReviewRounds: Math.max(1, settings.learn.maxReviewRounds - 1),
                      },
                    })
                  }
                >
                  -
                </button>
                <strong>{settings.learn.maxReviewRounds}</strong>
                <button
                  type="button"
                  className="tap ghost-btn"
                  onClick={() =>
                    patchSettings({
                      learn: {
                        ...settings.learn,
                        maxReviewRounds: Math.min(10, settings.learn.maxReviewRounds + 1),
                      },
                    })
                  }
                >
                  +
                </button>
              </div>
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>句子填空训练</strong>
                <div className="setting-hint">在测试页右上角启用“句子填空”按钮</div>
              </div>
              <ToggleSwitch
                checked={settings.sentencePractice.enabled}
                onChange={(enabled) =>
                  patchSentencePractice({
                    enabled,
                  })
                }
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>AI 评分反馈</strong>
                <div className="setting-hint">关闭后可继续练习，但不调用 AI 打分</div>
              </div>
              <ToggleSwitch
                checked={settings.sentencePractice.aiEnabled}
                disabled={!settings.sentencePractice.enabled}
                onChange={(aiEnabled) =>
                  patchSentencePractice({
                    aiEnabled,
                  })
                }
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>AI 角色姓名</strong>
                <div className="setting-hint">例如：老师、小英、学习搭子</div>
              </div>
              <input
                className="setting-input"
                value={settings.sentencePractice.aiRole.name}
                disabled={!settings.sentencePractice.enabled || !settings.sentencePractice.aiEnabled}
                onChange={(event) =>
                  patchSentencePractice({
                    aiRole: {
                      ...settings.sentencePractice.aiRole,
                      name: event.target.value,
                    },
                  })
                }
              />
            </SettingsItem>

            <SettingsItem>
              <div className="sentence-criteria-section">
                <strong>AI 角色性格</strong>
                <div className="setting-hint">决定 AI 的说话方式，如“鼓励型、幽默型、严格型”。</div>
                <textarea
                  className="setting-textarea"
                  rows={3}
                  value={settings.sentencePractice.aiRole.personality}
                  disabled={!settings.sentencePractice.enabled || !settings.sentencePractice.aiEnabled}
                  onChange={(event) =>
                    patchSentencePractice({
                      aiRole: {
                        ...settings.sentencePractice.aiRole,
                        personality: event.target.value,
                      },
                    })
                  }
                />
              </div>
            </SettingsItem>

            <SettingsItem>
              <div className="sentence-criteria-section">
                <strong>AI 反馈标准</strong>
                <div className="setting-hint">默认全部开启。至少保留 1 项。</div>
                <div className="sentence-criteria-grid">
                  {SENTENCE_FEEDBACK_OPTIONS.map((option) => {
                    const checked = settings.sentencePractice.feedbackCriteria.includes(option.key);
                    const disabled = !settings.sentencePractice.enabled || !settings.sentencePractice.aiEnabled;
                    return (
                      <button
                        type="button"
                        key={option.key}
                        className={`tap sentence-criteria-chip ${checked ? 'active' : ''}`}
                        disabled={disabled}
                        onClick={() => handleToggleSentenceCriterion(option.key)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </SettingsItem>
          </div>

          <button
            type="button"
            className={`tap settings-fold-toggle ${showAdvancedLearn ? 'open' : ''}`}
            onClick={() => setShowAdvancedLearn((prev) => !prev)}
          >
            <span>高级复习参数（SM-2）</span>
            <span>{showAdvancedLearn ? '▾' : '▸'}</span>
          </button>

          {showAdvancedLearn ? (
            <>
              <div className="setting-group-title">复习间隔（0-5 自评）</div>
              <div className="setting-group">
                <SettingsItem>
                  <div>
                    <strong>0 分：立即回炉</strong>
                    <div className="setting-hint">下次间隔（分钟）</div>
                  </div>
                  <div className="goal-stepper">
                    <button
                      type="button"
                      className="tap ghost-btn"
                      onClick={() => patchSm2({ grade0Minutes: Math.max(1, settings.sm2.grade0Minutes - 1) })}
                    >
                      -
                    </button>
                    <strong>{settings.sm2.grade0Minutes} 分钟</strong>
                    <button
                      type="button"
                      className="tap ghost-btn"
                      onClick={() => patchSm2({ grade0Minutes: Math.min(120, settings.sm2.grade0Minutes + 1) })}
                    >
                      +
                    </button>
                  </div>
                </SettingsItem>

                <SettingsItem>
                  <div>
                    <strong>1 分：很难</strong>
                    <div className="setting-hint">下次间隔（分钟）</div>
                  </div>
                  <div className="goal-stepper">
                    <button
                      type="button"
                      className="tap ghost-btn"
                      onClick={() => patchSm2({ grade1Minutes: Math.max(1, settings.sm2.grade1Minutes - 5) })}
                    >
                      -
                    </button>
                    <strong>{settings.sm2.grade1Minutes} 分钟</strong>
                    <button
                      type="button"
                      className="tap ghost-btn"
                      onClick={() => patchSm2({ grade1Minutes: Math.min(720, settings.sm2.grade1Minutes + 5) })}
                    >
                      +
                    </button>
                  </div>
                </SettingsItem>

                <SettingsItem>
                  <div>
                    <strong>2 分：困难重置</strong>
                    <div className="setting-hint">下次间隔（天）</div>
                  </div>
                  <div className="goal-stepper">
                    <button
                      type="button"
                      className="tap ghost-btn"
                      onClick={() => patchSm2({ grade2Days: Math.max(1, settings.sm2.grade2Days - 1) })}
                    >
                      -
                    </button>
                    <strong>{settings.sm2.grade2Days} 天</strong>
                    <button
                      type="button"
                      className="tap ghost-btn"
                      onClick={() => patchSm2({ grade2Days: Math.min(7, settings.sm2.grade2Days + 1) })}
                    >
                      +
                    </button>
                  </div>
                </SettingsItem>

                <SettingsItem>
                  <div>
                    <strong>3 分：勉强增长倍率</strong>
                    <div className="setting-hint">公式：上次间隔 × 倍率</div>
                  </div>
                  <div className="goal-stepper">
                    <button
                      type="button"
                      className="tap ghost-btn"
                      onClick={() =>
                        patchSm2({ grade3Multiplier: stepFloat(settings.sm2.grade3Multiplier, -0.05, 1.05, 2) })
                      }
                    >
                      -
                    </button>
                    <strong>{settings.sm2.grade3Multiplier.toFixed(2)}x</strong>
                    <button
                      type="button"
                      className="tap ghost-btn"
                      onClick={() =>
                        patchSm2({ grade3Multiplier: stepFloat(settings.sm2.grade3Multiplier, 0.05, 1.05, 2) })
                      }
                    >
                      +
                    </button>
                  </div>
                </SettingsItem>

                <SettingsItem>
                  <div>
                    <strong>4 分：简单增长倍率</strong>
                    <div className="setting-hint">公式：上次间隔 × 倍率 × Ease</div>
                  </div>
                  <div className="goal-stepper">
                    <button
                      type="button"
                      className="tap ghost-btn"
                      onClick={() =>
                        patchSm2({ grade4Multiplier: stepFloat(settings.sm2.grade4Multiplier, -0.05, 1, 3.5) })
                      }
                    >
                      -
                    </button>
                    <strong>{settings.sm2.grade4Multiplier.toFixed(2)}x</strong>
                    <button
                      type="button"
                      className="tap ghost-btn"
                      onClick={() =>
                        patchSm2({ grade4Multiplier: stepFloat(settings.sm2.grade4Multiplier, 0.05, 1, 3.5) })
                      }
                    >
                      +
                    </button>
                  </div>
                </SettingsItem>

                <SettingsItem>
                  <div>
                    <strong>5 分：轻松增长倍率</strong>
                    <div className="setting-hint">公式：上次间隔 × 倍率 × Ease</div>
                  </div>
                  <div className="goal-stepper">
                    <button
                      type="button"
                      className="tap ghost-btn"
                      onClick={() =>
                        patchSm2({ grade5Multiplier: stepFloat(settings.sm2.grade5Multiplier, -0.05, 1.2, 5) })
                      }
                    >
                      -
                    </button>
                    <strong>{settings.sm2.grade5Multiplier.toFixed(2)}x</strong>
                    <button
                      type="button"
                      className="tap ghost-btn"
                      onClick={() =>
                        patchSm2({ grade5Multiplier: stepFloat(settings.sm2.grade5Multiplier, 0.05, 1.2, 5) })
                      }
                    >
                      +
                    </button>
                  </div>
                </SettingsItem>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {group === 'model' ? (
        <section>
          <div className="setting-group-title">词汇提取</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>默认提取模式</strong>
                <div className="setting-hint">
                  {VOCAB_EXTRACT_MODE_OPTIONS.find((option) => option.value === settings.vocabExtractMode)
                    ?.description ?? ''}
                </div>
              </div>
              <SelectMenu
                value={settings.vocabExtractMode}
                options={VOCAB_EXTRACT_MODE_OPTIONS.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                onChange={(value) => patchSettings({ vocabExtractMode: value })}
              />
            </SettingsItem>
          </div>

          <div className="setting-group-title">LLM 配置</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>LLM Provider</strong>
              </div>
              <SelectMenu
                value={settings.llm.provider}
                options={[
                  { label: 'DeepSeek', value: 'deepseek' },
                  { label: 'OpenAI', value: 'openai' },
                  { label: 'Zhipu', value: 'zhipu' },
                  { label: 'Custom', value: 'custom' },
                ]}
                onChange={patchLlmProvider}
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>API Key</strong>
              </div>
              <div className="input-inline">
                <input
                  className={`setting-input ${highlightModel ? 'highlight' : ''}`}
                  type={showLlmKey ? 'text' : 'password'}
                  value={settings.llm.apiKey}
                  onChange={(event) => patchSettings({ llm: { ...settings.llm, apiKey: event.target.value } })}
                  placeholder="sk-..."
                />
                <button type="button" className="tap inline-eye" onClick={() => setShowLlmKey((prev) => !prev)}>
                  👁
                </button>
              </div>
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>Base URL</strong>
              </div>
              <input
                className="setting-input"
                value={settings.llm.baseUrl}
                onChange={(event) => patchSettings({ llm: { ...settings.llm, baseUrl: event.target.value } })}
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>Model</strong>
              </div>
              <input
                className="setting-input"
                value={settings.llm.model}
                onChange={(event) => patchSettings({ llm: { ...settings.llm, model: event.target.value } })}
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>Temperature</strong>
                <div className="setting-hint">留空自动，某些模型需设为 1</div>
              </div>
              <input
                className="setting-input"
                type="number"
                min="0"
                max="2"
                step="0.1"
                placeholder="自动"
                value={settings.llm.temperature ?? ''}
                onChange={(event) => {
                  const val = event.target.value;
                  patchSettings({
                    llm: {
                      ...settings.llm,
                      temperature: val === '' ? undefined : Number(val),
                    },
                  });
                }}
              />
            </SettingsItem>
          </div>

          <div className="setting-group-title">小模型配置</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>Small LLM Provider</strong>
                <div className="setting-hint">用于混合模式和小模型全流程的分批加工</div>
              </div>
              <SelectMenu
                value={settings.smallLlm.provider}
                options={[
                  { label: 'DeepSeek', value: 'deepseek' },
                  { label: 'OpenAI', value: 'openai' },
                  { label: 'Zhipu', value: 'zhipu' },
                  { label: 'Custom', value: 'custom' },
                ]}
                onChange={patchSmallLlmProvider}
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>Small API Key</strong>
              </div>
              <div className="input-inline">
                <input
                  className="setting-input"
                  type={showSmallLlmKey ? 'text' : 'password'}
                  value={settings.smallLlm.apiKey}
                  onChange={(event) =>
                    patchSettings({ smallLlm: { ...settings.smallLlm, apiKey: event.target.value } })
                  }
                  placeholder="sk-..."
                />
                <button type="button" className="tap inline-eye" onClick={() => setShowSmallLlmKey((prev) => !prev)}>
                  👁
                </button>
              </div>
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>Small Base URL</strong>
              </div>
              <input
                className="setting-input"
                value={settings.smallLlm.baseUrl}
                onChange={(event) =>
                  patchSettings({ smallLlm: { ...settings.smallLlm, baseUrl: event.target.value } })
                }
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>Small Model</strong>
              </div>
              <input
                className="setting-input"
                value={settings.smallLlm.model}
                onChange={(event) =>
                  patchSettings({ smallLlm: { ...settings.smallLlm, model: event.target.value } })
                }
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>Small Temperature</strong>
                <div className="setting-hint">留空自动，某些模型需设为 1</div>
              </div>
              <input
                className="setting-input"
                type="number"
                min="0"
                max="2"
                step="0.1"
                placeholder="自动"
                value={settings.smallLlm.temperature ?? ''}
                onChange={(event) => {
                  const val = event.target.value;
                  patchSettings({
                    smallLlm: {
                      ...settings.smallLlm,
                      temperature: val === '' ? undefined : Number(val),
                    },
                  });
                }}
              />
            </SettingsItem>
          </div>

          <div className="setting-group-title">连接测试</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>LLM 连接</strong>
                <div className="setting-hint">验证 LLM API 是否可正常访问</div>
              </div>
              <div className="test-connection-wrap">
                <button
                  type="button"
                  className={`tap test-connection-btn ${llmTestStatus}`}
                  onClick={handleTestLLM}
                  disabled={llmTestStatus === 'testing'}
                >
                  {llmTestStatus === 'testing' ? '测试中...' : '测试连接'}
                </button>
                {llmTestMessage ? (
                  <div className={`test-connection-message ${llmTestStatus}`}>{llmTestMessage}</div>
                ) : null}
                {llmDiagnostics.length > 0 ? (
                  <button
                    type="button"
                    className="tap connection-detail-toggle"
                    onClick={() => setShowLlmDiagnostics((prev) => !prev)}
                    aria-expanded={showLlmDiagnostics}
                  >
                    {showLlmDiagnostics ? '收起详情' : '查看详情'}
                  </button>
                ) : null}
                {showLlmDiagnostics && llmDiagnostics.length > 0 ? (
                  <div className="connection-diagnostics">
                    {llmTestAdvice ? <p className="connection-advice">{llmTestAdvice}</p> : null}
                    {llmDiagnostics.map((item) => (
                      <div className={`connection-diagnostic ${item.status}`} key={`${item.key}-${item.label}`}>
                        <span className="connection-diagnostic-dot" />
                        <div className="connection-diagnostic-body">
                          <strong>
                            {item.label}
                            <span>{getDiagnosticStatusText(item.status)}</span>
                          </strong>
                          <p>{item.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </SettingsItem>
          </div>
        </section>
      ) : null}

      {group === 'exa' ? (
        <section>
          <div className="setting-group-title">Exa 搜索配置</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>Exa API Key</strong>
                <div className="setting-hint">用于新闻网页搜索</div>
              </div>
              <div className="input-inline">
                <input
                  className={`setting-input ${highlightExa ? 'highlight' : ''}`}
                  type={showExaKey ? 'text' : 'password'}
                  value={settings.exa.apiKey}
                  onChange={(event) =>
                    patchSettings({
                      exa: {
                        ...settings.exa,
                        apiKey: event.target.value,
                      },
                    })
                  }
                  placeholder="exa_..."
                />
                <button type="button" className="tap inline-eye" onClick={() => setShowExaKey((prev) => !prev)}>
                  👁
                </button>
              </div>
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>Exa Base URL</strong>
              </div>
              <input
                className="setting-input"
                value={settings.exa.baseUrl}
                onChange={(event) =>
                  patchSettings({
                    exa: {
                      ...settings.exa,
                      baseUrl: event.target.value,
                    },
                  })
                }
                placeholder="https://api.exa.ai"
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>默认搜索条数</strong>
                <div className="setting-hint">阅读页的默认值（可在页面里临时修改）</div>
              </div>
              <input
                className="setting-input"
                type="number"
                min={1}
                max={20}
                value={settings.exa.defaultNumResults}
                onChange={(event) => {
                  const raw = Number(event.target.value);
                  const safe = Number.isFinite(raw) ? Math.max(1, Math.min(20, Math.round(raw))) : 5;
                  patchSettings({
                    exa: {
                      ...settings.exa,
                      defaultNumResults: safe,
                    },
                  });
                }}
              />
            </SettingsItem>
          </div>
        </section>
      ) : null}

      {group === 'ocr' ? (
        <section>
          <div className="setting-group-title">OCR 配置</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>OCR 类型</strong>
              </div>
              <Segmented
                options={[
                  { label: 'DeepSeek', value: 'deepseek' },
                  { label: 'Self-hosted', value: 'selfhosted' },
                ]}
                value={settings.ocr.type}
                onChange={(value) => patchSettings({ ocr: { ...settings.ocr, type: value } })}
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>OCR API Key</strong>
              </div>
              <div className="input-inline">
                <input
                  className={`setting-input ${highlightOcr ? 'highlight' : ''}`}
                  type={showOcrKey ? 'text' : 'password'}
                  value={settings.ocr.apiKey ?? ''}
                  onChange={(event) => patchSettings({ ocr: { ...settings.ocr, apiKey: event.target.value } })}
                />
                <button type="button" className="tap inline-eye" onClick={() => setShowOcrKey((prev) => !prev)}>
                  👁
                </button>
              </div>
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>OCR Base URL</strong>
              </div>
              <input
                className="setting-input"
                value={settings.ocr.baseUrl}
                onChange={(event) => patchSettings({ ocr: { ...settings.ocr, baseUrl: event.target.value } })}
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>OCR Model</strong>
              </div>
              <input
                className="setting-input"
                value={settings.ocr.model}
                onChange={(event) => patchSettings({ ocr: { ...settings.ocr, model: event.target.value } })}
              />
            </SettingsItem>
          </div>

          <div className="setting-group-title">连接测试</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>OCR 连接</strong>
                <div className="setting-hint">验证 OCR API 是否可正常访问</div>
              </div>
              <div className="test-connection-wrap">
                <button
                  type="button"
                  className={`tap test-connection-btn ${ocrTestStatus}`}
                  onClick={handleTestOCR}
                  disabled={ocrTestStatus === 'testing'}
                >
                  {ocrTestStatus === 'testing' ? '测试中...' : '测试连接'}
                </button>
                {ocrTestMessage ? (
                  <div className={`test-connection-message ${ocrTestStatus}`}>{ocrTestMessage}</div>
                ) : null}
              </div>
            </SettingsItem>
          </div>
        </section>
      ) : null}

      {group === 'speech' ? (
        <section>
          <div className="setting-group-title">背景音乐</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>背景轻音乐</strong>
              </div>
              <ToggleSwitch
                checked={settings.bgMusic.enabled}
                onChange={(enabled) => patchSettings({ bgMusic: { ...settings.bgMusic, enabled } })}
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>音量</strong>
                <small>{settings.bgMusic.volume.toFixed(2)}</small>
              </div>
              <input
                className="setting-range"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.bgMusic.volume}
                onChange={(event) =>
                  patchSettings({ bgMusic: { ...settings.bgMusic, volume: Number(event.target.value) } })
                }
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>上传 MP3</strong>
              </div>
              <label className="tap ghost-btn file-btn">
                选择 MP3
                <input
                  type="file"
                  accept="audio/mpeg"
                  onClick={(event) => {
                    (event.target as HTMLInputElement).value = '';
                  }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        patchSettings({
                          bgMusic: {
                            ...settings.bgMusic,
                            base64: String(reader.result),
                            fileName: file.name,
                          },
                        });
                      } catch {
                        notify?.('error', '本地存储空间不足，请先移除壁纸或清理浏览器数据');
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </SettingsItem>
          </div>

          <div className="setting-group-title">发音引擎</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>引擎类型</strong>
              </div>
              <Segmented
                options={[
                  { label: '浏览器', value: 'browser' },
                  { label: 'OpenAI', value: 'openai' },
                  { label: 'Azure', value: 'azure' },
                ]}
                value={settings.tts.type}
                onChange={(value) => patchSettings({ tts: { ...settings.tts, type: value } })}
              />
            </SettingsItem>
          </div>

          {settings.tts.type === 'openai' ? (
            <>
              <div className="setting-group-title">OpenAI TTS</div>
              <div className="setting-group">
                <SettingsItem>
                  <div>
                    <strong>声音</strong>
                    <small>{settings.tts.voice ?? 'alloy'}</small>
                  </div>
                  <select
                    className="setting-select"
                    value={settings.tts.voice ?? 'alloy'}
                    onChange={(event) =>
                      patchSettings({
                        tts: { ...settings.tts, voice: event.target.value as AppSettings['tts']['voice'] },
                      })
                    }
                  >
                    <option value="alloy">alloy</option>
                    <option value="echo">echo</option>
                    <option value="fable">fable</option>
                    <option value="onyx">onyx</option>
                    <option value="nova">nova</option>
                    <option value="shimmer">shimmer</option>
                  </select>
                </SettingsItem>

                <SettingsItem>
                  <div>
                    <strong>语速</strong>
                    <small>{(settings.tts.speed ?? 1.0).toFixed(1)}x</small>
                  </div>
                  <input
                    className="setting-range"
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={settings.tts.speed ?? 1.0}
                    onChange={(event) =>
                      patchSettings({
                        tts: { ...settings.tts, speed: Number(event.target.value) },
                      })
                    }
                  />
                </SettingsItem>

                <SettingsItem>
                  <div>
                    <strong>试听</strong>
                  </div>
                  <button
                    type="button"
                    className="tap secondary-btn"
                    onClick={() => {
                      const text = 'Hello, this is LinguaFlash.';
                      void import('../tts').then(({ speakWord }) => {
                        void speakWord(text, settings, 'us');
                      });
                    }}
                  >
                    ▶ 试听
                  </button>
                </SettingsItem>
              </div>
            </>
          ) : null}

          {settings.tts.type === 'azure' ? (
            <>
              <div className="setting-group-title">Azure TTS</div>
              <div className="setting-group">
                <SettingsItem>
                  <div>
                    <strong>Azure Key</strong>
                  </div>
                  <div className="input-inline">
                    <input
                      className="setting-input"
                      type={showAzureKey ? 'text' : 'password'}
                      value={settings.tts.azureKey ?? ''}
                      onChange={(event) =>
                        patchSettings({ tts: { ...settings.tts, azureKey: event.target.value } })
                      }
                    />
                    <button type="button" className="tap inline-eye" onClick={() => setShowAzureKey((prev) => !prev)}>
                      👁
                    </button>
                  </div>
                </SettingsItem>

                <SettingsItem>
                  <div>
                    <strong>Azure Region</strong>
                  </div>
                  <input
                    className="setting-input"
                    value={settings.tts.azureRegion ?? ''}
                    onChange={(event) =>
                      patchSettings({ tts: { ...settings.tts, azureRegion: event.target.value } })
                    }
                  />
                </SettingsItem>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {group === 'appearance' ? (
        <section>
          <div className="setting-group-title">排版</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>全局字体</strong>
                <div className="setting-hint">选择你喜欢的显示字体</div>
              </div>
              <SelectMenu
                value={settings.appearance.fontFamily || 'system-ui'}
                options={[
                  { label: '系统默认', value: 'system-ui' },
                  { label: '无衬线体 (Sans-serif)', value: 'sans-serif' },
                  { label: '衬线体 (Serif)', value: 'serif' },
                  { label: '等宽字体 (Monospace)', value: 'monospace' },
                  { label: '楷体', value: 'KaiTi, serif' },
                  { label: '宋体', value: 'SimSun, serif' },
                  { label: '微软雅黑', value: '"Microsoft YaHei", sans-serif' },
                ]}
                onChange={(value) =>
                  patchSettings({ appearance: { ...settings.appearance, fontFamily: value } })
                }
              />
            </SettingsItem>
          </div>

          <div className="setting-group-title">动态效果</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>界面动效</strong>
                <div className="setting-hint">控制背景漂浮、页面切换和导航强调动画</div>
              </div>
              <ToggleSwitch
                checked={settings.appearance.motionEffects}
                onChange={(motionEffects) =>
                  patchSettings({
                    appearance: {
                      ...settings.appearance,
                      motionEffects,
                    },
                  })
                }
              />
            </SettingsItem>
          </div>

          <div className="setting-group-title">壁纸</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>壁纸类型</strong>
              </div>
              <Segmented
                options={[
                  { label: '默认', value: 'default' },
                  { label: '自定义', value: 'custom' },
                ]}
                value={settings.appearance.wallpaperType}
                onChange={(value) =>
                  patchSettings({ appearance: { ...settings.appearance, wallpaperType: value } })
                }
              />
            </SettingsItem>

            {settings.appearance.wallpaperType === 'custom' ? (
              <SettingsItem>
                <div>
                  <strong>上传壁纸</strong>
                </div>
                <label className="tap ghost-btn file-btn">
                  选择图片
                  <input
                    type="file"
                    accept="image/*"
                    onClick={(event) => {
                      (event.target as HTMLInputElement).value = '';
                    }}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      const img = new Image();
                      const url = URL.createObjectURL(file);
                      img.onload = () => {
                        URL.revokeObjectURL(url);
                        const MAX_SIZE = 1920;
                        const MAX_BYTES = 4 * 1024 * 1024;
                        let { width, height } = img;
                        if (width > MAX_SIZE || height > MAX_SIZE) {
                          const scale = MAX_SIZE / Math.max(width, height);
                          width = Math.round(width * scale);
                          height = Math.round(height * scale);
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) {
                          notify?.('error', '浏览器不支持 Canvas，无法压缩图片');
                          return;
                        }
                        ctx.drawImage(img, 0, 0, width, height);
                        let quality = 0.8;
                        let base64 = canvas.toDataURL('image/jpeg', quality);
                        while (base64.length > MAX_BYTES && quality > 0.1) {
                          quality -= 0.1;
                          base64 = canvas.toDataURL('image/jpeg', quality);
                        }
                        if (base64.length > MAX_BYTES) {
                          notify?.('error', '图片过大，即使压缩后仍超出存储限制，请选择更小的图片');
                          return;
                        }
                        try {
                          patchSettings({
                            appearance: {
                              ...settings.appearance,
                              wallpaperType: 'custom',
                              wallpaperBase64: base64,
                              brightness: 0.92,
                              blur: 0,
                              overlayOpacity: 0.04,
                            },
                          });
                          notify?.('success', '壁纸已应用');
                        } catch {
                          notify?.('error', '本地存储空间不足，请先移除背景音乐或清理浏览器数据');
                        }
                      };
                      img.onerror = () => {
                        URL.revokeObjectURL(url);
                        notify?.('error', '图片加载失败，请选择其他图片');
                      };
                      img.src = url;
                    }}
                  />
                </label>
              </SettingsItem>
            ) : null}
          </div>

          <div className="setting-group-title">调节</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>亮度</strong>
                <small>{settings.appearance.brightness.toFixed(2)}</small>
              </div>
              <input
                className="setting-range"
                type="range"
                min={0.3}
                max={1}
                step={0.01}
                value={settings.appearance.brightness}
                onChange={(event) =>
                  patchSettings({
                    appearance: {
                      ...settings.appearance,
                      brightness: Number(event.target.value),
                    },
                  })
                }
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>模糊</strong>
                <small>{settings.appearance.blur}px</small>
              </div>
              <input
                className="setting-range"
                type="range"
                min={0}
                max={30}
                step={1}
                value={settings.appearance.blur}
                onChange={(event) =>
                  patchSettings({
                    appearance: {
                      ...settings.appearance,
                      blur: Number(event.target.value),
                    },
                  })
                }
              />
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>遮罩</strong>
                <small>{settings.appearance.overlayOpacity.toFixed(2)}</small>
              </div>
              <input
                className="setting-range"
                type="range"
                min={0}
                max={0.6}
                step={0.01}
                value={settings.appearance.overlayOpacity}
                onChange={(event) =>
                  patchSettings({
                    appearance: {
                      ...settings.appearance,
                      overlayOpacity: Number(event.target.value),
                    },
                  })
                }
              />
            </SettingsItem>
          </div>

          <div className="appearance-preview-wrap">
            <MiniPreviewCard motionEnabled={settings.appearance.motionEffects} />
          </div>
        </section>
      ) : null}

      {group === 'data' ? (
        <section>
          <div className="setting-group-title">导入导出</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>导出词库</strong>
              </div>
              <button type="button" className="tap ghost-btn" onClick={onExport}>
                导出 JSON
              </button>
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>导入词库</strong>
              </div>
              <label className="tap ghost-btn file-btn">
                导入 JSON
                <input
                  type="file"
                  accept="application/json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      onImport(file);
                    }
                  }}
                />
              </label>
            </SettingsItem>
          </div>

          <div className="setting-group-title">危险操作</div>
          <div className="setting-group">
            <SettingsItem>
              <div>
                <strong>重置所有数据</strong>
              </div>
              <button type="button" className="tap danger-btn" onClick={onResetData}>
                清空
              </button>
            </SettingsItem>

            <SettingsItem>
              <div>
                <strong>恢复默认设置</strong>
              </div>
              <button
                type="button"
                className="tap ghost-btn"
                onClick={() => {
                  const updated = saveSettings(DEFAULT_SETTINGS);
                  onSettingsChange(updated);
                }}
              >
                恢复默认
              </button>
            </SettingsItem>
          </div>
        </section>
      ) : null}

      {group === 'about' ? (
        <section className="about-section">
          <h3>LinguaFlash</h3>
          <p>基于 OCR + 大语言模型的个人英语点读卡片与智能复习系统。</p>
          <ul>
            <li>前端：React + TypeScript</li>
            <li>本地数据：IndexedDB + localStorage</li>
            <li>后端：Node.js 代理</li>
          </ul>
        </section>
      ) : null}
    </div>
  );

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-shell">
        <header className="settings-header">
          <h2>系统设置</h2>
          <button type="button" className="tap top-nav-icon-btn" onClick={onClose}>
            ×
          </button>
        </header>

        {isDesktop ? (
          <div className="settings-desktop">
            <aside className="settings-sidebar">
              {GROUPS.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={`tap settings-nav-item ${item.key === group ? 'active' : ''}`}
                  onClick={() => setGroup(item.key)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </aside>
            <main className="settings-main">{groupContent}</main>
          </div>
        ) : (
          <>
            <nav className="settings-mobile-tabs">
              {GROUPS.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={`tap settings-mobile-tab ${item.key === group ? 'active' : ''}`}
                  onClick={() => setGroup(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <main className="settings-main">{groupContent}</main>
          </>
        )}
      </div>
    </div>
  );
}
