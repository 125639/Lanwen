// src/components/learn/GroupTest.tsx
import { useState, useRef, useEffect } from 'react';
import { logReview, saveWordStatus } from '../../db';
import type { ReviewWrongReason, WordCard } from '../../types';
import { highlightDifferences, isSpellingSimilar } from '../../utils/editDistance';

function playWordAudio(word: string, accent?: 'uk' | 'us'): void {
  void import('../../tts').then(({ playWordAudio: play }) => play(word, accent));
}

interface Props {
  bookId: string;
  words: WordCard[];
  onComplete: (results: { wordId: number; passed: boolean }[]) => void;
  onExit: () => void;
  onCurrentWordChange?: (word: WordCard | null) => void;
}

type TestPhase = 'question' | 'answer' | 'feedback';

export function GroupTest({ bookId, words, onComplete, onExit, onCurrentWordChange }: Props) {
  const [queue, setQueue] = useState<WordCard[]>(words);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<TestPhase>('question');
  const [results, setResults] = useState<Record<number, { wordId: number; passed: boolean }>>({});
  const [spellingInput, setSpellingInput] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'correct' | 'incorrect' | 'close' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentWord = queue[currentIndex];
  const isSpelling = currentWord?.memoryType === 'spelling';
  const resultEntries = Object.values(results);
  const passedCount = resultEntries.filter((r) => r.passed).length;
  const initialTotal = Math.max(1, words.length);
  const progress = queue.length > 0 ? (passedCount / initialTotal) * 100 : 100;

  useEffect(() => {
    setQueue(words);
    setCurrentIndex(0);
    setPhase('question');
    setResults({});
    setSpellingInput('');
    setShowHint(false);
    setFeedbackType(null);
  }, [words]);

  useEffect(() => {
    if (phase === 'question' && isSpelling && inputRef.current) {
      inputRef.current.focus();
    }
  }, [phase, isSpelling, currentIndex]);

  useEffect(() => {
    onCurrentWordChange?.(currentWord ?? null);
  }, [currentWord, onCurrentWordChange]);

  const handleShowAnswer = () => {
    setPhase('answer');
  };

  const persistResult = (passed: boolean, wrongReason?: ReviewWrongReason) => {
    if (!currentWord?.id) {
      return;
    }

    const timestamp = Date.now();
    void saveWordStatus(currentWord.id, bookId, passed ? 'known' : 'wrong', {
      testPassed: passed,
      wrongReason,
      timestamp,
    });
    void logReview({
      wordId: currentWord.id,
      bookId,
      mode: isSpelling ? 'zh2en' : 'en2zh',
      result: passed ? 'easy' : 'hard',
      timestamp,
      grade: passed ? 4 : 1,
      wrongReason,
      sourceMode: 'learn',
    }, { syncStatus: false });
  };

  const handleSpellingSubmit = () => {
    if (!currentWord) return;
    const input = spellingInput.trim().toLowerCase();
    const target = currentWord.word.toLowerCase();

    if (input === target) {
      // 完全正确
      setFeedbackType('correct');
      setPhase('feedback');
      window.setTimeout(() => handlePass(), 800);
    } else if (isSpellingSimilar(input, target)) {
      // 接近正确
      setFeedbackType('close');
      setPhase('feedback');
    } else {
      // 错误
      setFeedbackType('incorrect');
      setPhase('feedback');
    }
  };

  const handlePass = () => {
    if (!currentWord || !currentWord.id) return;

    persistResult(true);
    const newResults = {
      ...results,
      [currentWord.id]: { wordId: currentWord.id, passed: true },
    };
    setResults(newResults);

    // 从队列中移除
    const newQueue = queue.filter((w) => w.id !== currentWord.id);
    setQueue(newQueue);

    if (newQueue.length === 0) {
      // 全部通过
      onComplete(Object.values(newResults));
    } else {
      // 下一题
      setCurrentIndex(0);
      setPhase('question');
      setSpellingInput('');
      setShowHint(false);
      setFeedbackType(null);
    }
  };

  const handleFail = () => {
    if (!currentWord || !currentWord.id) return;

    const wrongReason: ReviewWrongReason = isSpelling ? 'spelling' : 'meaning';
    persistResult(false, wrongReason);
    const newResults = {
      ...results,
      [currentWord.id]: { wordId: currentWord.id, passed: false },
    };
    setResults(newResults);

    // 追加到队列末尾
    const newQueue = [...queue.filter((w) => w.id !== currentWord.id), currentWord];
    setQueue(newQueue);

    setCurrentIndex(0);
    setPhase('question');
    setSpellingInput('');
    setShowHint(false);
    setFeedbackType(null);
  };

  if (!currentWord) {
    return (
      <div className="group-test-empty">
        <div className="complete-emoji">🎉</div>
        <h3>全部掌握！</h3>
        <button className="complete-btn primary" onClick={() => onComplete(Object.values(results))}>
          完成本组
        </button>
      </div>
    );
  }

  return (
    <div className="group-test">
      {/* 顶部进度条 */}
      <div className="test-progress-bar">
        <div className="test-progress-fill" style={{ width: `${progress}%` }} />
        <span className="test-progress-text">
          已通过 {passedCount} / {words.length}
        </span>
      </div>

      {/* 题目区域 */}
      <div className="test-question">
        {/* 识记测试 */}
        {!isSpelling && phase === 'question' && (
          <div className="recognition-test">
            <div className="recognition-meaning">
              <span className="pos-chip">{currentWord.pos}</span>
              <h3 className="meaning-main">{currentWord.meaning_brief}</h3>
            </div>
            <div className="recognition-actions">
              <button
                className="test-audio-btn"
                onClick={() => playWordAudio(currentWord.word)}
              >
                🔊 提示发音
              </button>
              <button className="test-reveal-btn" onClick={handleShowAnswer}>
                显示答案
              </button>
            </div>
          </div>
        )}

        {/* 识记测试 - 答案展示 */}
        {!isSpelling && phase === 'answer' && (
          <div className="recognition-answer">
            <h2 className="answer-word">{currentWord.word}</h2>
            <div className="answer-phonetic">
              {currentWord.phonetic_us}
              <button onClick={() => playWordAudio(currentWord.word)}>🔊</button>
            </div>
            <div className="answer-actions">
              <button className="grade-btn fail" onClick={handleFail}>
                ✗ 没记住
              </button>
              <button className="grade-btn pass" onClick={handlePass}>
                ✓ 记住了
              </button>
            </div>
          </div>
        )}

        {/* 拼写测试 */}
        {isSpelling && phase === 'question' && (
          <div className="spelling-test">
            <div className="spelling-meaning">
              <span className="pos-chip">{currentWord.pos}</span>
              <h3 className="meaning-main">{currentWord.meaning_brief}</h3>
            </div>
            <button
              className="test-audio-btn"
              onClick={() => playWordAudio(currentWord.word)}
            >
              🔊 听音
            </button>

            {showHint && (
              <div className="hint-badge">
                首字母提示: {currentWord.word[0]} {'_ '.repeat(currentWord.word.length - 1)}
              </div>
            )}

            <div className="spelling-input-wrap">
              <input
                ref={inputRef}
                type="text"
                className={`spelling-input ${feedbackType || ''}`}
                value={spellingInput}
                onChange={(e) => setSpellingInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSpellingSubmit()}
                placeholder="请输入英文单词..."
                disabled={phase !== 'question'}
              />
              <div className="char-count">
                {spellingInput.length} / {currentWord.word.length}
              </div>
            </div>

            <div className="spelling-actions">
              <button
                className="hint-btn"
                onClick={() => setShowHint(true)}
                disabled={showHint}
              >
                💡 显示首字母
              </button>
              <button
                className="submit-btn"
                onClick={handleSpellingSubmit}
                disabled={!spellingInput.trim()}
              >
                提交答案
              </button>
            </div>
          </div>
        )}

        {/* 拼写反馈 */}
        {isSpelling && phase === 'feedback' && (
          <div className={`spelling-feedback ${feedbackType || ''}`}>
            {feedbackType === 'correct' && (
              <>
                <div className="feedback-icon">✓</div>
                <p className="feedback-text">正确！</p>
              </>
            )}

            {feedbackType === 'close' && (
              <>
                <div className="feedback-icon">💡</div>
                <p className="feedback-text">接近正确！检查一下？</p>
                <div className="feedback-highlight">
                  {highlightDifferences(spellingInput, currentWord.word).map((item, i) => (
                    <span key={i} className={item.isDiff ? 'diff' : 'correct'}>
                      {item.char}
                    </span>
                  ))}
                </div>
                <div className="feedback-actions">
                  <button className="grade-btn fail" onClick={handleFail}>
                    需要再记
                  </button>
                  <button className="grade-btn pass" onClick={handlePass}>
                    其实我会
                  </button>
                </div>
              </>
            )}

            {feedbackType === 'incorrect' && (
              <>
                <div className="feedback-icon">✗</div>
                <p className="feedback-text">再想想看</p>
                <p className="correct-answer">
                  正确答案：<strong>{currentWord.word}</strong>
                </p>
                <div className="feedback-actions">
                  <button className="grade-btn fail" onClick={handleFail}>
                    我拼错了
                  </button>
                  <button className="grade-btn pass" onClick={handlePass}>
                    其实我会
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 退出按钮 */}
      <button className="test-exit-btn" onClick={onExit}>
        退出测试
      </button>
    </div>
  );
}
