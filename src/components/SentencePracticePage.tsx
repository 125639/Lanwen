import { useEffect, useMemo, useState } from 'react';
import { evaluateSentence } from '../api';
import type {
  AppSettings,
  SentenceEvaluationResult,
  SentenceFeedbackCriterion,
  SentencePracticeMode,
  WordCard,
} from '../types';

interface SentencePracticePageProps {
  mode: SentencePracticeMode;
  words: WordCard[];
  settings: AppSettings;
  onClose: () => void;
}

interface SentenceCandidate {
  id: string;
  sourceText: string;
  referenceText?: string;
  word: string;
}

const FEEDBACK_LABELS: Record<Exclude<SentenceFeedbackCriterion, 'score'>, string> = {
  grammar: '语法正确性',
  vocabulary: '用词准确性',
  semantic: '语义相似度',
  improvement: '改进建议',
};

function normalizeSentence(value: unknown): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length > 320) {
    return normalized.slice(0, 320);
  }
  return normalized;
}

function buildCandidates(words: WordCard[], mode: SentencePracticeMode): SentenceCandidate[] {
  const candidates: SentenceCandidate[] = [];
  const dedupe = new Set<string>();

  words.forEach((word, index) => {
    const sentencePairs: Array<[unknown, unknown]> =
      mode === 'en2zh'
        ? [
            [word.origin_sentence, word.origin_translation],
            [word.ai_example_en, word.ai_example_zh],
            [word.examSentence, word.examSentenceZh],
          ]
        : [
            [word.origin_translation, word.origin_sentence],
            [word.ai_example_zh, word.ai_example_en],
            [word.examSentenceZh, word.examSentence],
          ];

    sentencePairs.forEach(([sourceRaw, referenceRaw]) => {
      const sourceText = normalizeSentence(sourceRaw);
      if (!sourceText) {
        return;
      }

      const dedupeKey = `${mode}:${sourceText.toLowerCase()}`;
      if (dedupe.has(dedupeKey)) {
        return;
      }

      dedupe.add(dedupeKey);
      const referenceText = normalizeSentence(referenceRaw) || undefined;

      candidates.push({
        id: `${word.id ?? `word-${index}`}-${candidates.length}`,
        sourceText,
        referenceText,
        word: word.word,
      });
    });
  });

  return candidates;
}

function getRandomCandidate(
  candidates: SentenceCandidate[],
  currentId?: string | null,
): SentenceCandidate | null {
  if (!candidates.length) {
    return null;
  }

  if (!currentId || candidates.length === 1) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  let next = candidates[Math.floor(Math.random() * candidates.length)];
  let attempts = 0;
  while (next.id === currentId && attempts < 6) {
    next = candidates[Math.floor(Math.random() * candidates.length)];
    attempts += 1;
  }
  return next;
}

export function SentencePracticePage({ mode, words, settings, onClose }: SentencePracticePageProps) {
  const [sourceType, setSourceType] = useState<'library' | 'custom'>('library');
  const [currentCandidateId, setCurrentCandidateId] = useState<string | null>(null);
  const [customSentence, setCustomSentence] = useState('');
  const [userTranslation, setUserTranslation] = useState('');
  const [showReference, setShowReference] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SentenceEvaluationResult | null>(null);

  const candidates = useMemo(() => buildCandidates(words, mode), [mode, words]);

  const currentCandidate = useMemo(
    () => candidates.find((item) => item.id === currentCandidateId) ?? null,
    [candidates, currentCandidateId],
  );

  const originalSentence =
    sourceType === 'library' ? currentCandidate?.sourceText ?? '' : normalizeSentence(customSentence);
  const referenceSentence = sourceType === 'library' ? currentCandidate?.referenceText ?? '' : '';

  useEffect(() => {
    if (!candidates.length) {
      setCurrentCandidateId(null);
      return;
    }
    if (currentCandidateId && candidates.some((item) => item.id === currentCandidateId)) {
      return;
    }
    setCurrentCandidateId(getRandomCandidate(candidates)?.id ?? null);
  }, [candidates, currentCandidateId]);

  const resetResult = () => {
    setResult(null);
    setError(null);
  };

  const handleSourceTypeChange = (next: 'library' | 'custom') => {
    setSourceType(next);
    setUserTranslation('');
    setShowReference(false);
    resetResult();
  };

  const handleRandomNext = () => {
    const next = getRandomCandidate(candidates, currentCandidateId);
    if (!next) {
      return;
    }
    setCurrentCandidateId(next.id);
    setUserTranslation('');
    resetResult();
  };

  const handleEvaluate = async () => {
    const sourceText = originalSentence;
    const answerText = userTranslation.trim();

    if (!sourceText) {
      setError(sourceType === 'custom' ? '请先输入原句。' : '当前没有可用句子，请先换源或导入词库。');
      return;
    }

    if (!answerText) {
      setError('请先填写你的翻译。');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (!settings.sentencePractice.aiEnabled) {
        setResult({
          score: undefined,
          feedback: {
            improvement: referenceSentence
              ? `参考表达：${referenceSentence}`
              : 'AI 评分已关闭，你可以继续尝试更自然、简洁的表达。',
          },
          detailedComment: '当前已关闭 AI 评估。你可以对照参考句进行自我纠错，再尝试下一句。',
        });
        return;
      }

      const evaluated = await evaluateSentence({
        settings,
        mode,
        originalSentence: sourceText,
        userTranslation: answerText,
        feedbackCriteria: settings.sentencePractice.feedbackCriteria,
        aiRole: settings.sentencePractice.aiRole,
      });

      setResult(evaluated);
    } catch (err) {
      setError(err instanceof Error ? err.message : '评估失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const feedbackKeys = settings.sentencePractice.feedbackCriteria.filter(
    (criterion): criterion is Exclude<SentenceFeedbackCriterion, 'score'> => criterion !== 'score',
  );

  return (
    <section className="sentence-practice-page">
      <header className="sentence-practice-head">
        <div>
          <h3>句子填空 · {mode === 'en2zh' ? '英译汉' : '汉译英'}</h3>
          <p>不要求与例句完全一致，重点看语义和表达是否自然。</p>
        </div>
        <button type="button" className="tap ghost-btn" onClick={onClose}>
          返回测验
        </button>
      </header>

      <div className="sentence-source-toggle segmented">
        <button
          type="button"
          className={`tap segmented-item ${sourceType === 'library' ? 'active' : ''}`}
          onClick={() => handleSourceTypeChange('library')}
        >
          词库随机句
        </button>
        <button
          type="button"
          className={`tap segmented-item ${sourceType === 'custom' ? 'active' : ''}`}
          onClick={() => handleSourceTypeChange('custom')}
        >
          自定义输入
        </button>
      </div>

      {sourceType === 'library' ? (
        currentCandidate ? (
          <div className="sentence-source-card">
            <div className="sentence-source-meta">
              <span>{mode === 'en2zh' ? '请翻译这句英文' : '请翻译这句中文'}</span>
              <span>词汇：{currentCandidate.word}</span>
            </div>
            <p className="sentence-source-text">{currentCandidate.sourceText}</p>
            <div className="sentence-source-actions">
              <button type="button" className="tap ghost-btn" onClick={handleRandomNext}>
                换一句
              </button>
              {currentCandidate.referenceText ? (
                <button
                  type="button"
                  className="tap ghost-btn"
                  onClick={() => setShowReference((prev) => !prev)}
                >
                  {showReference ? '隐藏参考' : '显示参考'}
                </button>
              ) : null}
            </div>
            {showReference && currentCandidate.referenceText ? (
              <p className="sentence-reference">参考：{currentCandidate.referenceText}</p>
            ) : null}
          </div>
        ) : (
          <div className="sentence-source-empty">当前词库暂无可用例句，请切换到自定义输入。</div>
        )
      ) : (
        <div className="sentence-custom-wrap">
          <label className="sentence-label">输入原句（{mode === 'en2zh' ? '英文' : '中文'}）</label>
          <textarea
            className="sentence-origin-input"
            rows={3}
            value={customSentence}
            placeholder={mode === 'en2zh' ? '例如：I stayed up late to finish the report.' : '例如：为了赶完报告，我昨晚熬夜了。'}
            onChange={(event) => {
              setCustomSentence(event.target.value);
              resetResult();
            }}
          />
        </div>
      )}

      <div className="sentence-answer-wrap">
        <label className="sentence-label">你的翻译</label>
        <textarea
          className="sentence-answer-input"
          rows={4}
          value={userTranslation}
          placeholder={mode === 'en2zh' ? '写出你的中文表达...' : 'Write your English sentence...'}
          onChange={(event) => {
            setUserTranslation(event.target.value);
            resetResult();
          }}
        />
        <div className="sentence-submit-row">
          <button
            type="button"
            className="tap primary-btn"
            onClick={() => void handleEvaluate()}
            disabled={loading}
          >
            {loading ? 'AI 分析中...' : settings.sentencePractice.aiEnabled ? '提交并 AI 评估' : '提交'}
          </button>
          <button
            type="button"
            className="tap ghost-btn"
            onClick={() => {
              setUserTranslation('');
              resetResult();
            }}
          >
            清空
          </button>
        </div>
        {!settings.sentencePractice.aiEnabled ? (
          <p className="sentence-ai-disabled-hint">AI 评估已关闭，仅保留句子练习与参考查看。</p>
        ) : null}
      </div>

      {error ? <div className="sentence-practice-error">{error}</div> : null}

      {result ? (
        <div className="sentence-result-card">
          <div className="sentence-result-head">
            <strong>{settings.sentencePractice.aiEnabled ? `${settings.sentencePractice.aiRole.name} 的反馈` : '练习反馈'}</strong>
            {typeof result.score === 'number' ? (
              <span className="sentence-score-badge">{result.score} / 100</span>
            ) : null}
          </div>

          {feedbackKeys.map((key) => {
            const text = result.feedback[key]?.trim();
            if (!text) {
              return null;
            }
            return (
              <div key={key} className="sentence-feedback-item">
                <span>{FEEDBACK_LABELS[key]}</span>
                <p>{text}</p>
              </div>
            );
          })}

          {result.detailedComment ? <p className="sentence-detailed-comment">{result.detailedComment}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
