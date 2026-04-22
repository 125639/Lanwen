// src/components/learn/FlashCard.tsx
import { useRef, useState } from 'react';
import type { WordCard, WordStatus } from '../../types';

function playWordAudio(word: string, accent?: 'uk' | 'us'): void {
  void import('../../tts').then(({ playWordAudio: play }) => play(word, accent));
}

interface Props {
  word: WordCard & { state: WordStatus['state'] };
  index: number;
  total: number;
  onKnown: () => void;
  onUnknown: () => void;
}

export function FlashCard({ word, index, total, onKnown, onUnknown }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleKnown = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    triggerSwipe('right');
    setTimeout(() => {
      onKnown();
      setIsAnimating(false);
    }, 300);
  };

  const handleUnknown = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    triggerSwipe('left');
    setTimeout(() => {
      onUnknown();
      setIsAnimating(false);
    }, 300);
  };

  const triggerSwipe = (direction: 'left' | 'right') => {
    if (!cardRef.current) return;
    const x = direction === 'right' ? '120%' : '-120%';
    const color = direction === 'right'
      ? 'rgba(16, 185, 129, 0.3)'  // 绿色
      : 'rgba(239, 68, 68, 0.3)';  // 红色
    cardRef.current.style.transition = 'transform 280ms ease, box-shadow 280ms';
    cardRef.current.style.transform = `translateX(${x}) rotate(${direction === 'right' ? 8 : -8}deg)`;
    cardRef.current.style.boxShadow = `0 0 0 3px ${color}`;
  };

  const isSpelling = word.memoryType === 'spelling';

  return (
    <div className="flashcard-stage">
      {/* 进度条 */}
      <div className="learn-progress-bar">
        <div
          className="learn-progress-fill"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      {/* 顶部标签行 */}
      <div className="flashcard-header">
        <span className="flashcard-progress-text">{index + 1} / {total}</span>
        {word.memoryType && (
          <span className={`memory-type-tag ${isSpelling ? 'spelling' : 'recognition'}`}>
            {isSpelling ? '✎ 拼写' : '👁 识记'}
          </span>
        )}
      </div>

      {/* 卡片主体 */}
      <div className="flashcard" ref={cardRef}>
        <h2 className="flashcard-word">{word.word}</h2>

        {/* 音标行 */}
        <div className="flashcard-phonetic">
          <span className="phonetic-group">
            <span className="phonetic-label">英</span>
            <span className="phonetic-text">{word.phonetic_uk}</span>
            <button
              className="audio-btn-mini"
              onClick={() => playWordAudio(word.word, 'uk')}
              aria-label="播放英音"
            >
              🔊
            </button>
          </span>
          <span className="phonetic-group">
            <span className="phonetic-label">美</span>
            <span className="phonetic-text">{word.phonetic_us}</span>
            <button
              className="audio-btn-mini"
              onClick={() => playWordAudio(word.word, 'us')}
              aria-label="播放美音"
            >
              🔊
            </button>
          </span>
        </div>

        <p className="flashcard-hint">你认识这个词吗？</p>

        {/* 底部按钮 */}
        <div className="flashcard-actions">
          <button className="flashcard-btn unknown" onClick={handleUnknown}>
            <span>😶</span>
            <span>不认识</span>
          </button>
          <button className="flashcard-btn known" onClick={handleKnown}>
            <span>我记得</span>
            <span>✅</span>
          </button>
        </div>
      </div>
    </div>
  );
}
