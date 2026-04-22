import { useEffect, useMemo, useRef, useState } from 'react';
import { logReview, updateSM2CardByGrade } from '../db';
import { SpacedRepetitionQueue } from '../queue';
import type { AppSettings, WordCard } from '../types';
import { formatReviewEta, type SM2Grade } from '../sm2';
import { speakWord } from '../utils';
import { WordCard as WordCardView } from './WordCard';
import { SentencePracticePage } from './SentencePracticePage';

interface TestModePageProps {
  mode: 'en2zh' | 'zh2en';
  words: WordCard[];
  settings: AppSettings;
  bookId: string | null;
  onBackHome: () => void;
  onRefresh: () => void;
  onCurrentWordChange?: (word: WordCard | null) => void;
}

function createQueue(words: WordCard[]) {
  return new SpacedRepetitionQueue(words, true);
}

const GRADE_CONFIG: Array<{
  grade: SM2Grade;
  emoji: string;
  label: string;
  desc: string;
  pass: boolean;
}> = [
  { grade: 0, emoji: '😭', label: '0', desc: '完全不会', pass: false },
  { grade: 1, emoji: '😓', label: '1', desc: '很难', pass: false },
  { grade: 2, emoji: '😐', label: '2', desc: '困难', pass: false },
  { grade: 3, emoji: '🙂', label: '3', desc: '勉强', pass: true },
  { grade: 4, emoji: '😊', label: '4', desc: '简单', pass: true },
  { grade: 5, emoji: '🤩', label: '5', desc: '轻松', pass: true },
];

export function TestModePage({
  mode,
  words,
  settings,
  bookId,
  onBackHome,
  onRefresh,
  onCurrentWordChange,
}: TestModePageProps) {
  const queueRef = useRef<SpacedRepetitionQueue>(createQueue(words));
  const answerShownAtRef = useRef<number>(0);
  const lastBookIdRef = useRef<string | null>(bookId);
  const lastModeRef = useRef<string>(mode);
  const [revealed, setRevealed] = useState(false);
  const [motion, setMotion] = useState<'idle' | 'leaving' | 'entering'>('idle');
  const [renderSeed, setRenderSeed] = useState(0);
  const [nextReviewHint, setNextReviewHint] = useState<string | null>(null);
  const [activeGrade, setActiveGrade] = useState<SM2Grade | null>(null);
  const [showSentencePractice, setShowSentencePractice] = useState(false);

  // Effect 1: Only recreate queue when bookId or mode changes
  // words is intentionally omitted - onRefresh() updates words but should NOT reset queue
  useEffect(() => {
    const bookChanged = lastBookIdRef.current !== bookId;
    const modeChanged = lastModeRef.current !== mode;

    if (bookChanged || modeChanged) {
      queueRef.current = createQueue(words);
      setRevealed(false);
      setShowSentencePractice(false);
      setMotion('idle');
      setRenderSeed((prev) => prev + 1);
      lastBookIdRef.current = bookId;
      lastModeRef.current = mode;
    }
  }, [bookId, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: Initialize queue only when words first load (or become non-empty)
  useEffect(() => {
    if (words.length > 0 && queueRef.current.progress.total === 0) {
      queueRef.current = createQueue(words);
      setRenderSeed((prev) => prev + 1);
    }
  }, [words]); // Re-check when words change; guard above prevents unnecessary re-init

  const queue = queueRef.current;
  const current = queue.current;
  const progress = queue.progress;

  useEffect(() => {
    onCurrentWordChange?.(showSentencePractice ? null : current ?? null);
  }, [current, onCurrentWordChange, showSentencePractice]);

  useEffect(() => {
    if (!settings.sentencePractice.enabled && showSentencePractice) {
      setShowSentencePractice(false);
    }
  }, [settings.sentencePractice.enabled, showSentencePractice]);

  const progressPercent = useMemo(() => {
    const denominator = progress.easy + progress.remaining;
    if (denominator <= 0) {
      return 100;
    }
    return (progress.easy / denominator) * 100;
  }, [progress.easy, progress.remaining]);

  const handleReveal = () => {
    answerShownAtRef.current = Date.now();
    setRevealed(true);
  };

  const handleToggleSentencePractice = () => {
    setShowSentencePractice((prev) => !prev);
    setRevealed(false);
  };

  const handleSpeak = () => {
    if (!current) {
      return;
    }
    speakWord(current.word, settings, 'uk');
  };

  const handleGrade = async (grade: SM2Grade) => {
    if (!current || !bookId) {
      return;
    }
    const currentId = current.id;
    if (typeof currentId !== 'number') {
      return;
    }

    const cfg = GRADE_CONFIG.find((g) => g.grade === grade);
    if (!cfg) {
      return;
    }

    setActiveGrade(grade);
    setMotion('leaving');

    const responseTimeMs = answerShownAtRef.current
      ? Date.now() - answerShownAtRef.current
      : Number.MAX_SAFE_INTEGER;

    window.setTimeout(async () => {
      if (cfg.pass) {
        queueRef.current.markEasy();
      } else {
        queueRef.current.markHard();
      }

      const updated = await updateSM2CardByGrade({
        wordId: currentId,
        bookId,
        grade,
        responseTimeMs,
        schedule: settings.sm2,
      }).catch(() => null);

      await logReview({
        wordId: currentId,
        bookId,
        mode,
        result: cfg.pass ? 'easy' : 'hard',
        timestamp: Date.now(),
        grade,
        wrongReason: cfg.pass ? undefined : mode === 'zh2en' ? 'spelling' : 'meaning',
        sourceMode: 'test',
      }).catch(() => undefined);

      if (updated) {
        setNextReviewHint(formatReviewEta(updated.nextReviewAt));
        window.setTimeout(() => {
          setNextReviewHint(null);
        }, 1500);
      }

      setRevealed(false);
      setRenderSeed((prev) => prev + 1);
      setMotion('entering');
      setActiveGrade(null);
      onRefresh();

      window.setTimeout(() => {
        setMotion('idle');
      }, 250);
    }, 300);
  };

  const handleRestart = () => {
    queueRef.current = createQueue(words);
    setRevealed(false);
    setMotion('idle');
    setRenderSeed((prev) => prev + 1);
  };

  if (!words.length) {
    return <section className="empty-state">当前教程没有单词，请先在词库中上传或导入。</section>;
  }

  return (
    <section className="test-page">
      <div className="test-progress-fixed">
        <div className="test-progress-track">
          <div className="test-progress-bar" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {settings.sentencePractice.enabled ? (
        <div className="test-tools-row">
          <button
            type="button"
            className={`tap ghost-btn sentence-practice-toggle ${showSentencePractice ? 'active' : ''}`}
            onClick={handleToggleSentencePractice}
          >
            {showSentencePractice ? '返回测验模式' : '句子填空'}
          </button>
        </div>
      ) : null}

      {nextReviewHint && !showSentencePractice ? <div className="next-review-bubble">下次复习：{nextReviewHint}</div> : null}

      {showSentencePractice ? (
        <SentencePracticePage
          mode={mode}
          words={words}
          settings={settings}
          onClose={() => setShowSentencePractice(false)}
        />
      ) : queue.isDone ? (
        <div className="complete-screen" key={`done-${renderSeed}`}>
          <p className="complete-emoji">🎉</p>
          <h2>本轮完成！</h2>
          <div className="complete-stats">
            <p>✅ 通过：{progress.easy} 个</p>
            <p>🔄 困难：{progress.hard} 个</p>
            <p>📊 共练习：{progress.total} 次</p>
          </div>
          <div className="row-buttons">
            <button type="button" className="tap primary-btn" onClick={handleRestart}>
              再练一轮
            </button>
            <button type="button" className="tap ghost-btn" onClick={onBackHome}>
              返回首页
            </button>
          </div>
        </div>
      ) : (
        <article className={`test-card ${motion}`} key={`${current?.id ?? 'none'}-${renderSeed}`}>
          <div className="test-front">
            {mode === 'en2zh' ? (
              <>
                <h2 className="text-word test-word">{current?.word}</h2>
                <p className="text-phonetic">{current?.phonetic_uk || current?.phonetic_us || '/'}</p>
              </>
            ) : (
              <h2 className="test-meaning">{current?.meaning_brief}</h2>
            )}

            <div className="test-front-actions">
              <button type="button" className="tap test-audio" onClick={handleSpeak}>
                🔊 {mode === 'en2zh' ? '发音' : '提示音'}
              </button>
              <button type="button" className="tap primary-btn" onClick={handleReveal}>
                揭晓答案
              </button>
            </div>
          </div>

          <div className={`answer-panel ${revealed ? 'revealed' : ''}`}>
            {current ? (
              <WordCardView
                word={current}
                hideFavorite
                onSpeak={(_text, accent) => speakWord(current.word, settings, accent)}
              />
            ) : null}
            <div className="sm2-grade-grid">
              {GRADE_CONFIG.map((item) => (
                <button
                  key={item.grade}
                  type="button"
                  className={`tap sm2-grade-btn ${item.pass ? 'pass' : 'fail'} ${item.grade === 3 ? 'mid' : ''} ${activeGrade === item.grade ? 'active' : ''}`}
                  onClick={() => void handleGrade(item.grade)}
                >
                  <small>{item.desc}</small>
                  <span>
                    {item.emoji} {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
