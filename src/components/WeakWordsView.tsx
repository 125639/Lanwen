import { useEffect, useMemo, useRef, useState } from 'react';
import { getWeakWords, logReview } from '../db';
import type { AppSettings, WordCard } from '../types';
import type { SM2Grade } from '../sm2';
import { WordCard as WordCardView } from './WordCard';
import { speakWord } from '../utils';
import { SpacedRepetitionQueue } from '../queue';

interface WeakWordsViewProps {
  bookId: string | null;
  settings: AppSettings;
  onBack: () => void;
}

interface WeakWord extends WordCard {
  errorCount: number;
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

export function WeakWordsView({ bookId, settings, onBack }: WeakWordsViewProps) {
  const [weakWords, setWeakWords] = useState<WeakWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [motion, setMotion] = useState<'idle' | 'leaving' | 'entering'>('idle');
  const [finished, setFinished] = useState(false);
  const [eliminated, setEliminated] = useState(0);
  const [activeGrade, setActiveGrade] = useState<SM2Grade | null>(null);

  const queueRef = useRef<SpacedRepetitionQueue | null>(null);
  const answerShownAtRef = useRef<number>(0);
  const timeoutsRef = useRef<number[]>([]);

  // Load weak words
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getWeakWords(bookId, 50).then((words) => {
      if (!mounted) return;
      setWeakWords(words);
      if (words.length > 0) {
        queueRef.current = new SpacedRepetitionQueue(words, true);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
      // Clear all pending timeouts on unmount
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, [bookId]);

  const queue = queueRef.current;
  const current = queue?.current ?? null;
  const progress = queue?.progress ?? { total: 0, remaining: 0, easy: 0 };

  const eliminatedPercent = useMemo(() => {
    if (progress.total === 0) return 0;
    return Math.round((eliminated / progress.total) * 100);
  }, [eliminated, progress.total]);

  const handleReveal = () => {
    answerShownAtRef.current = Date.now();
    setRevealed(true);
  };

  const handleSpeak = () => {
    if (!current) return;
    speakWord(current.word, settings, 'uk');
  };

  const handleGrade = async (grade: SM2Grade) => {
    if (!current) return;
    const currentId = current.id;
    if (typeof currentId !== 'number') return;

    const cfg = GRADE_CONFIG.find((g) => g.grade === grade);
    if (!cfg) return;

    setActiveGrade(grade);
    setMotion('leaving');

    const timeoutId = window.setTimeout(async () => {
      if (cfg.pass) {
        queue?.markEasy();
        setEliminated((prev) => prev + 1);
      } else {
        queue?.markHard();
      }

      // Log review with grade for weak words tracking
      await logReview({
        wordId: currentId,
        bookId: current.bookId,
        mode: 'en2zh',
        result: cfg.pass ? 'easy' : 'hard',
        timestamp: Date.now(),
        grade,
        wrongReason: cfg.pass ? undefined : current.memoryType === 'spelling' ? 'spelling' : 'meaning',
        sourceMode: 'weak',
      }).catch((err) => console.error('Failed to log review:', err));

      if (queue?.progress.remaining === 0) {
        setFinished(true);
      } else {
        setRevealed(false);
        setMotion('entering');
        const enterTimeoutId = window.setTimeout(() => setMotion('idle'), 250);
        timeoutsRef.current.push(enterTimeoutId);
      }
      setActiveGrade(null);
      // Remove this timeout from tracking
      timeoutsRef.current = timeoutsRef.current.filter((id) => id !== timeoutId);
    }, 300);
    timeoutsRef.current.push(timeoutId);
  };

  if (loading) {
    return (
      <div className="weak-words-view">
        <div className="weak-words-loading">
          <div className="spinner" />
          <p>加载错词本...</p>
        </div>
      </div>
    );
  }

  if (weakWords.length === 0) {
    return (
      <div className="weak-words-view">
        <div className="weak-words-empty">
          <div className="weak-words-banner">
            <h2>🎉 太棒了！</h2>
            <p>近 30 天内没有错词记录</p>
          </div>
          <button className="tap primary-btn" onClick={onBack}>
            返回学习
          </button>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="weak-words-view">
        <div className="weak-words-finished">
          <div className="weak-words-banner">
            <h2>✅ 错词复习完成</h2>
            <p>已消灭 {eliminated} 个错词</p>
          </div>

          <div className="eliminated-ring">
            <svg viewBox="0 0 100 100">
              <circle className="ring-bg" cx="50" cy="50" r="40" />
              <circle
                className="ring-progress"
                cx="50"
                cy="50"
                r="40"
                style={{
                  strokeDasharray: `${eliminatedPercent * 2.51} 251`,
                }}
              />
            </svg>
            <div className="ring-text">
              <span className="percent">{eliminatedPercent}%</span>
              <span className="label">消灭率</span>
            </div>
          </div>

          <div className="weak-words-actions">
            <button className="tap primary-btn" onClick={onBack}>
              返回学习
            </button>
            <button
              className="tap ghost-btn"
              onClick={() => {
                setFinished(false);
                setEliminated(0);
                setRevealed(false);
                setMotion('idle');
                queueRef.current = new SpacedRepetitionQueue(weakWords, true);
              }}
            >
              再次复习
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="weak-words-view">
      {/* Banner */}
      <div className="weak-words-banner">
        <div className="banner-content">
          <h2>⚠️ 错词本 · {progress.total} 个需加强</h2>
          <p>近 30 天答错的单词，按错误次数降序排列</p>
        </div>
        <button className="banner-close" onClick={onBack}>✕</button>
      </div>

      {/* Progress */}
      <div className="weak-words-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${((progress.total - progress.remaining) / Math.max(1, progress.total)) * 100}%` }}
          />
        </div>
        <span className="progress-text">
          {progress.total - progress.remaining} / {progress.total}
        </span>
      </div>

      {/* Card */}
      <div className={`card-stage weak-words-stage ${motion}`}>
        {current && (
          <div className="weak-word-card-wrapper">
            <div className="error-badge">错 {(current as WeakWord).errorCount} 次</div>
            <WordCardView
              word={current}
              hideFavorite
            />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="weak-words-controls">
        {!revealed ? (
          <div className="control-row">
            <button className="tap secondary-btn" onClick={handleSpeak}>
              🔊 发音
            </button>
            <button className="tap primary-btn reveal-btn" onClick={handleReveal}>
              显示释义
            </button>
          </div>
        ) : (
          <div className="grade-buttons">
            {GRADE_CONFIG.map((cfg) => (
              <button
                key={cfg.grade}
                className={`tap grade-btn grade-${cfg.grade} ${activeGrade === cfg.grade ? 'active' : ''}`}
                onClick={() => handleGrade(cfg.grade)}
                disabled={activeGrade !== null}
              >
                <span className="grade-emoji">{cfg.emoji}</span>
                <span className="grade-label">{cfg.label}</span>
                <span className="grade-desc">{cfg.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
