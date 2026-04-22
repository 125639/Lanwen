import { useEffect, useRef, useState } from 'react';
import { searchWords } from '../db';
import type { AppSettings, Book, TodayTaskSummary, WordCard as WordCardType } from '../types';
import { SWIPE_THRESHOLD, SWIPE_VELOCITY, speakWord } from '../utils';
import { BookSelector } from './BookSelector';
import { PageControl } from './PageControl';
import { SearchBar } from './SearchBar';
import { WordCard } from './WordCard';

interface CardsPageProps {
  books: Book[];
  activeBookId: string | null;
  words: WordCardType[];
  cardIndex: number;
  settings: AppSettings;
  interactive?: boolean;
  jumpWordId: number | null;
  taskSummary: TodayTaskSummary;
  activeTaskMode: 'review' | 'output' | null;
  goalsProgress: {
    newDone: number;
    reviewDone: number;
    newTarget: number;
    reviewTarget: number;
  };
  onStartTodayReview: () => void;
  onStopTodayReview: () => void;
  onStartLearn: () => void;
  onStartOutputPractice: () => void;
  onEnterWeakWords: () => void;
  onJumpHandled: () => void;
  onSelectBook: (bookId: string) => void;
  onCardIndexChange: (index: number) => void;
  onOpenUploader: () => void;
  onToggleFavorite: (word: WordCardType) => Promise<void>;
  onCurrentWordChange?: (word: WordCardType | null) => void;
}

type TurnDirection = 'next' | 'prev';

interface TransitionState {
  direction: TurnDirection;
  fromIndex: number;
  toIndex: number;
}

export function CardsPage({
  books,
  activeBookId,
  words,
  cardIndex,
  settings,
  interactive = true,
  jumpWordId,
  taskSummary,
  activeTaskMode,
  goalsProgress,
  onStartTodayReview,
  onStopTodayReview,
  onStartLearn,
  onStartOutputPractice,
  onEnterWeakWords,
  onJumpHandled,
  onSelectBook,
  onCardIndexChange,
  onOpenUploader,
  onToggleFavorite,
  onCurrentWordChange,
}: CardsPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WordCardType[]>([]);
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const [nextReviewBubble, setNextReviewBubble] = useState<string | null>(null);
  const [goalBurst, setGoalBurst] = useState(false);

  const activeCardRef = useRef<HTMLElement | null>(null);
  const touchStartXRef = useRef(0);
  const touchCurrentXRef = useRef(0);
  const touchStartTimeRef = useRef(0);

  const currentWord = words[cardIndex] ?? null;

  useEffect(() => {
    onCurrentWordChange?.(currentWord);
  }, [currentWord, onCurrentWordChange]);

  const newPercent = Math.min(100, Math.round((goalsProgress.newDone / Math.max(1, goalsProgress.newTarget)) * 100));
  const reviewPercent = Math.min(
    100,
    Math.round((goalsProgress.reviewDone / Math.max(1, goalsProgress.reviewTarget)) * 100),
  );
  const avgPercent = Math.min(100, Math.round((newPercent + reviewPercent) / 2));
  const goalDone = newPercent >= 100 && reviewPercent >= 100;

  useEffect(() => {
    if (!activeBookId || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void searchWords(activeBookId, searchQuery)
        .then((rows) => setSearchResults(rows))
        .catch(() => setSearchResults([]));
    }, 150);

    return () => window.clearTimeout(timer);
  }, [activeBookId, searchQuery]);

  useEffect(() => {
    if (!words.length) {
      if (cardIndex !== 0) {
        onCardIndexChange(0);
      }
      return;
    }

    if (cardIndex > words.length - 1) {
      onCardIndexChange(words.length - 1);
    }
  }, [cardIndex, onCardIndexChange, words.length]);

  useEffect(() => {
    if (!jumpWordId || !words.length) {
      return;
    }

    const targetIndex = words.findIndex((item) => item.id === jumpWordId);
    if (targetIndex >= 0) {
      onCardIndexChange(targetIndex);
      onJumpHandled();
    }
  }, [jumpWordId, onCardIndexChange, onJumpHandled, words]);

  useEffect(() => {
    if (goalDone) {
      setGoalBurst(true);
      const timer = window.setTimeout(() => {
        setGoalBurst(false);
      }, 1000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [goalDone]);

  const triggerPageTurn = (direction: TurnDirection) => {
    if (!interactive || transition || !words.length) {
      return;
    }

    const delta = direction === 'next' ? 1 : -1;
    const nextIndex = cardIndex + delta;
    if (nextIndex < 0 || nextIndex >= words.length) {
      return;
    }

    setTransition({ direction, fromIndex: cardIndex, toIndex: nextIndex });
    onCardIndexChange(nextIndex);

    window.setTimeout(() => {
      setTransition(null);
      if (activeCardRef.current) {
        activeCardRef.current.style.transform = 'translateX(0) rotate(0deg)';
        activeCardRef.current.style.transition = '';
      }
    }, 300);
  };

  const triggerPageTurnRef = useRef(triggerPageTurn);
  triggerPageTurnRef.current = triggerPageTurn;

  useEffect(() => {
    if (!interactive) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        triggerPageTurnRef.current('prev');
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        triggerPageTurnRef.current('next');
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [interactive]);

  const onTouchStart: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (!interactive || transition || !activeCardRef.current) {
      return;
    }
    const startX = event.touches[0]?.clientX ?? 0;
    touchStartXRef.current = startX;
    touchCurrentXRef.current = startX;
    touchStartTimeRef.current = Date.now();
    activeCardRef.current.style.transition = 'none';
  };

  const onTouchMove: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (!interactive || transition || !activeCardRef.current) {
      return;
    }
    const currentX = event.touches[0]?.clientX ?? touchCurrentXRef.current;
    touchCurrentXRef.current = currentX;
    const deltaX = currentX - touchStartXRef.current;
    activeCardRef.current.style.transform = `translateX(${deltaX * 0.4}px) rotate(${deltaX * 0.02}deg)`;
  };

  const onTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    if (!interactive || transition || !activeCardRef.current) {
      return;
    }

    const deltaX = touchCurrentXRef.current - touchStartXRef.current;
    const elapsed = Math.max(1, Date.now() - touchStartTimeRef.current);
    const velocity = Math.abs(deltaX) / elapsed;

    activeCardRef.current.style.transition = 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)';

    if (deltaX < -SWIPE_THRESHOLD || (velocity > SWIPE_VELOCITY && deltaX < 0)) {
      triggerPageTurn('next');
      return;
    }

    if (deltaX > SWIPE_THRESHOLD || (velocity > SWIPE_VELOCITY && deltaX > 0)) {
      triggerPageTurn('prev');
      return;
    }

    activeCardRef.current.style.transform = 'translateX(0) rotate(0deg)';
  };

  if (!words.length) {
    return (
      <section className="cards-page">
        <BookSelector books={books} activeBookId={activeBookId} onSelect={onSelectBook} onAdd={onOpenUploader} />
        <div className="empty-state empty-state-card">
          <div className="empty-icon">🗂️</div>
          <div className="empty-title">当前分组还没有单词</div>
          <div className="empty-desc">点击上传或导入单词后，就可以开始卡片学习和复习。</div>
        </div>
      </section>
    );
  }

  const incomingWord = transition ? words[transition.toIndex] : currentWord;
  const outgoingWord = transition ? words[transition.fromIndex] : null;
  const suggestedLabel =
    taskSummary.suggestedAction === 'learn'
      ? '先学新词'
      : taskSummary.suggestedAction === 'review'
        ? '先做复习'
        : taskSummary.suggestedAction === 'weak'
          ? '先补错词'
          : taskSummary.suggestedAction === 'output'
            ? '先做输出'
            : '已完成';

  return (
    <section className="cards-page">
      <BookSelector books={books} activeBookId={activeBookId} onSelect={onSelectBook} onAdd={onOpenUploader} />

      <section className="today-task-hub">
        <div className="today-task-hub-head">
          <div>
            <strong>今日任务中心</strong>
            <p>{taskSummary.headline}</p>
            <small>{taskSummary.subline}</small>
          </div>
          {activeTaskMode ? (
            <button type="button" className="tap task-hub-stop-btn" onClick={onStopTodayReview}>
              结束当前{activeTaskMode === 'output' ? '输出练习' : '复习'}
            </button>
          ) : (
            <span className={`task-hub-badge ${taskSummary.suggestedAction}`}>{suggestedLabel}</span>
          )}
        </div>

        <div className="today-task-grid">
          <button
            type="button"
            className={`tap today-task-card ${taskSummary.suggestedAction === 'learn' ? 'recommended' : ''}`}
            onClick={onStartLearn}
            disabled={taskSummary.newCount <= 0}
          >
            <span className="task-card-label">新词学习</span>
            <strong>{taskSummary.newCount}</strong>
            <small>开始一组背词</small>
          </button>

          <button
            type="button"
            className={`tap today-task-card ${taskSummary.suggestedAction === 'review' ? 'recommended' : ''}`}
            onClick={onStartTodayReview}
            disabled={taskSummary.reviewCount <= 0}
          >
            <span className="task-card-label">到期复习</span>
            <strong>{taskSummary.reviewCount}</strong>
            <small>优先清空高风险</small>
          </button>

          <button
            type="button"
            className={`tap today-task-card ${taskSummary.suggestedAction === 'weak' ? 'recommended' : ''}`}
            onClick={onEnterWeakWords}
            disabled={taskSummary.weakCount <= 0}
          >
            <span className="task-card-label">错词强化</span>
            <strong>{taskSummary.weakCount}</strong>
            <small>集中补薄弱词</small>
          </button>

          <button
            type="button"
            className={`tap today-task-card ${taskSummary.suggestedAction === 'output' ? 'recommended' : ''}`}
            onClick={onStartOutputPractice}
            disabled={taskSummary.outputCount <= 0}
          >
            <span className="task-card-label">输出练习</span>
            <strong>{taskSummary.outputCount}</strong>
            <small>切到 ZH→EN</small>
          </button>
        </div>
      </section>

      <section className={`goal-progress-card ${goalDone ? 'done' : ''} ${goalBurst ? 'burst' : ''}`}>
        <div className="goal-head">
          <strong>今日目标</strong>
          <span>
            {goalsProgress.newDone + goalsProgress.reviewDone} / {goalsProgress.newTarget + goalsProgress.reviewTarget}
          </span>
        </div>
        <div className="goal-track">
          <div className="goal-fill" style={{ width: `${avgPercent}%` }} />
        </div>
        <div className="goal-foot">
          {goalDone
            ? '✅ 今日目标达成！'
            : `还差 ${Math.max(0, goalsProgress.newTarget - goalsProgress.newDone + goalsProgress.reviewTarget - goalsProgress.reviewDone)} 个，加油！`}
        </div>
      </section>

      {nextReviewBubble ? <div className="next-review-bubble">下次复习：{nextReviewBubble}</div> : null}

      <SearchBar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        results={searchResults}
        onSelectResult={(word) => {
          if (!word.id) return;
          const index = words.findIndex((item) => item.id === word.id);
          if (index >= 0) onCardIndexChange(index);
          setSearchQuery('');
          setSearchResults([]);
        }}
      />

      <div className="word-card-stage">
        {outgoingWord ? (
          <WordCard word={outgoingWord} hideFavorite className={`word-card-motion outgoing ${transition?.direction ?? ''}`} />
        ) : null}

        {incomingWord ? (
          <WordCard
            ref={activeCardRef}
            word={incomingWord}
            onToggleFavorite={(word) => void onToggleFavorite(word)}
            onSpeak={(text, accent, onStateChange) => {
              speakWord(text, settings, accent, onStateChange);
            }}
            onJumpToRelated={(targetWord) => {
              const idx = words.findIndex((item) => item.word.toLowerCase() === targetWord.toLowerCase());
              if (idx >= 0) {
                onCardIndexChange(idx);
                return;
              }
              setSearchQuery(targetWord);
            }}
            onRequestAddRelated={(targetWord) => {
              setNextReviewBubble(`可添加 ${targetWord}`);
              window.setTimeout(() => setNextReviewBubble(null), 1500);
            }}
            className={
              transition
                ? `word-card-motion incoming ${transition.direction}`
                : 'word-card-motion steady'
            }
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
        ) : null}
      </div>

      <PageControl
        current={cardIndex}
        total={words.length}
        currentWord={currentWord?.word}
        onPrev={() => triggerPageTurn('prev')}
        onNext={() => triggerPageTurn('next')}
      />
    </section>
  );
}
