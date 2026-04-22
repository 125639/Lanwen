// src/components/learn/LearnModePage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppSettings, ReviewWrongReason, WordCard, WordStatus } from '../../types';
import {
  createLearnSession,
  finishLearnSession,
  getLearnQueue,
  getTestQueue,
  logReview,
  saveWordStatus,
  updateLearnSession,
} from '../../db';
import { FlashCard } from './FlashCard';
import { WordDetail } from './WordDetail';
import { GroupTest } from './GroupTest';
import { GroupDone } from './GroupDone';
import { WordListDrawer } from './WordListDrawer';
import { DailyProgress } from './DailyProgress';

interface Props {
  bookId: string | null;
  settings: AppSettings;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
  onBackToCards: () => void;
  onRefresh: () => void;
  onCurrentWordChange?: (word: WordCard | null) => void;
}

type LearnPhase = 'flashcard' | 'detail' | 'test' | 'done';

interface GroupStats {
  total: number;
  known: number;
  unknown: number;
  wrong: number;
  passed: number;
}

export function LearnModePage({
  bookId,
  settings,
  onNotify,
  onBackToCards,
  onRefresh,
  onCurrentWordChange,
}: Props) {
  const [phase, setPhase] = useState<LearnPhase>('flashcard');
  const [queue, setQueue] = useState<Array<WordCard & { state: WordStatus['state'] }>>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [groupStats, setGroupStats] = useState<GroupStats>({
    total: 0,
    known: 0,
    unknown: 0,
    wrong: 0,
    passed: 0,
  });
  const [showWordList, setShowWordList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [markedKnown, setMarkedKnown] = useState(false);

  const groupSize = settings.learn?.groupSize || 20;
  const groupTestWords = useMemo(() => {
    const seen = new Set<number>();

    return queue.filter((word) => {
      if ((word.state !== 'unknown' && word.state !== 'wrong') || typeof word.id !== 'number') {
        return false;
      }
      if (seen.has(word.id)) {
        return false;
      }

      seen.add(word.id);
      return true;
    });
  }, [queue]);

  // 加载学习队列
  const loadQueue = useCallback(async () => {
    if (!bookId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const words = await getLearnQueue(bookId, groupSize);
    setQueue(words);
    setGroupStats({
      total: words.length,
      known: 0,
      unknown: 0,
      wrong: 0,
      passed: 0,
    });
    setCurrentIndex(0);
    setPhase('flashcard');

    // 创建学习会话
    const sid = await createLearnSession(bookId, words.length);
    setSessionId(sid);
    setLoading(false);
  }, [bookId, groupSize]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const currentWord = queue[currentIndex];

  useEffect(() => {
    if (phase === 'flashcard' || phase === 'detail') {
      onCurrentWordChange?.(currentWord ?? null);
      return;
    }
    if (phase === 'done') {
      onCurrentWordChange?.(null);
    }
  }, [currentWord, onCurrentWordChange, phase]);

  // FlashCard 操作
  const handleKnown = async () => {
    if (!currentWord.id || !bookId) return;
    await saveWordStatus(currentWord.id, bookId, 'known');
    setQueue((prev) => prev.map((word) => (word.id === currentWord.id ? { ...word, state: 'known' } : word)));
    setMarkedKnown(true);
    setGroupStats((s) => ({ ...s, known: s.known + 1 }));
    setPhase('detail');
    onRefresh();

    if (sessionId) {
      await updateLearnSession(sessionId, { knownCount: groupStats.known + 1 });
    }
  };

  const handleUnknown = async () => {
    if (!currentWord.id || !bookId) return;
    const timestamp = Date.now();
    await saveWordStatus(currentWord.id, bookId, 'unknown', {
      wrongReason: 'meaning',
      timestamp,
    });
    await logReview(
      {
        wordId: currentWord.id,
        bookId,
        mode: 'en2zh',
        result: 'hard',
        timestamp,
        grade: 1,
        wrongReason: 'meaning',
        sourceMode: 'learn',
      },
      { syncStatus: false },
    );
    setMarkedKnown(false);
    setQueue((prev) => prev.map((word) => (word.id === currentWord.id ? { ...word, state: 'unknown' } : word)));
    setGroupStats((s) => ({ ...s, unknown: s.unknown + 1 }));
    setPhase('detail');
    onRefresh();

    if (sessionId) {
      await updateLearnSession(sessionId, { unknownCount: groupStats.unknown + 1 });
    }
  };

  // WordDetail 操作
  const handleMarkWrong = async (reason: ReviewWrongReason) => {
    if (!currentWord.id || !bookId) return;
    const timestamp = Date.now();
    await saveWordStatus(currentWord.id, bookId, 'wrong', {
      wrongReason: reason,
      timestamp,
    });
    await logReview(
      {
        wordId: currentWord.id,
        bookId,
        mode: reason === 'spelling' ? 'zh2en' : 'en2zh',
        result: 'hard',
        timestamp,
        grade: reason === 'spelling' ? 1 : 2,
        wrongReason: reason,
        sourceMode: 'learn',
      },
      { syncStatus: false },
    );
    setGroupStats((s) => ({
      ...s,
      known: s.known - 1,
      wrong: s.wrong + 1,
    }));
    onNotify('info', '已记录错因，稍后会再次出现并进入针对性复习');
    onRefresh();

    if (sessionId) {
      await updateLearnSession(sessionId, {
        knownCount: groupStats.known - 1,
        wrongCount: groupStats.wrong + 1,
      });
    }

    // 将记错的单词重新插入队列后方，稍后会再次出现
    const wrongWord = { ...currentWord, state: 'wrong' as WordStatus['state'] };
    const newQueueLength = queue.length + 1;
    setQueue((prev) => {
      const newQueue = prev.map((word) => (word.id === currentWord.id ? wrongWord : word));
      const insertPos = Math.min(currentIndex + 4, newQueue.length);
      newQueue.splice(insertPos, 0, wrongWord);
      return newQueue;
    });

    // 跳转到下一个单词
    setMarkedKnown(false); // 重置状态
    if (currentIndex < newQueueLength - 1) {
      setCurrentIndex((i) => i + 1);
      setPhase('flashcard');
    } else {
      startTest();
    }
  };

  const handleNext = () => {
    setMarkedKnown(false); // 重置状态
    if (currentIndex < queue.length - 1) {
      setCurrentIndex((i) => i + 1);
      setPhase('flashcard');
    } else {
      // 本组完成，进入测试
      startTest();
    }
  };

  const handleToggleFavorite = (favorited: boolean) => {
    onNotify('success', favorited ? '已收藏' : '已取消收藏');
  };

  // 开始测试
  const startTest = async () => {
    if (!bookId) return;

    // 获取需要测试的单词（unknown 或 wrong 状态）
    const wordIds = Array.from(
      new Set(queue.map((w) => w.id).filter((id): id is number => typeof id === 'number')),
    );
    const testWords = await getTestQueue(bookId, wordIds);

    if (testWords.length === 0) {
      // 无需测试，直接完成
      setPhase('done');
    } else {
      setPhase('test');
    }
  };

  // 测试完成
  const handleTestComplete = async (results: { wordId: number; passed: boolean }[]) => {
    const passedCount = results.filter((r) => r.passed).length;
    setGroupStats((s) => ({ ...s, passed: passedCount }));

    if (sessionId) {
      await updateLearnSession(sessionId, { passedTest: passedCount });
      await finishLearnSession(sessionId);
    }

    onRefresh();
    setPhase('done');
  };

  // 完成页操作
  const handleViewList = () => {
    setShowWordList(true);
  };

  const handleNextGroup = () => {
    loadQueue();
  };

  const handleFinish = () => {
    onRefresh();
    onNotify('success', '今日学习完成！继续保持！');
    onBackToCards();
  };

  const handleJumpToWord = (wordId: number) => {
    const index = queue.findIndex((w) => w.id === wordId);
    if (index >= 0) {
      setCurrentIndex(index);
      setPhase('detail');
      setShowWordList(false);
    }
  };

  if (loading) {
    return (
      <div className="learn-mode-page">
        <div className="learn-loading status-shell">
          <div className="status-card status-loading">
            <div className="status-icon">📖</div>
            <div>
              <strong>正在准备学习内容</strong>
              <p>正在整理本组单词和当前学习进度。</p>
            </div>
          </div>
          <div className="skeleton" style={{ height: 240, borderRadius: 24, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 52, borderRadius: 16 }} />
        </div>
      </div>
    );
  }

  if (!bookId) {
    return (
      <div className="learn-mode-page">
        <div className="learn-empty empty-state-card">
          <div className="empty-icon">📚</div>
          <div className="empty-title">请先选择分组</div>
          <div className="empty-desc">先在卡片页选择一个单词本，再进入背词模式开始学习。</div>
        </div>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="learn-mode-page">
        <div className="learn-empty empty-state-card success-tone">
          <div className="empty-icon">🎉</div>
          <div className="empty-title">太棒了！</div>
          <div className="empty-desc">当前分组的单词都已经学习完成，可以回到卡片页继续复习。</div>
          <button className="action-btn primary" onClick={handleFinish}>
            返回卡片页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="learn-mode-page">
      {/* 每日任务进度 */}
      <DailyProgress settings={settings} />

      {/* 顶部导航栏 */}
      <div className="learn-nav">
        <button className="learn-nav-btn" onClick={() => setShowWordList(true)}>
          ≡ 列表
        </button>
        <span className="learn-nav-title">
          {phase === 'flashcard' && '新词学习'}
          {phase === 'detail' && '单词详解'}
          {phase === 'test' && '组内测试'}
          {phase === 'done' && '本组完成'}
        </span>
        <div className="learn-nav-placeholder" />
      </div>

      {/* 主内容区 */}
      <div className="learn-content">
        {phase === 'flashcard' && currentWord && (
          <FlashCard
            word={currentWord}
            index={currentIndex}
            total={queue.length}
            onKnown={handleKnown}
            onUnknown={handleUnknown}
          />
        )}

        {phase === 'detail' && currentWord && (
          <WordDetail
            word={currentWord}
            showMarkWrong={markedKnown}
            onMarkWrong={handleMarkWrong}
            onNext={handleNext}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {phase === 'test' && (
          <GroupTest
            bookId={bookId}
            words={groupTestWords}
            onComplete={handleTestComplete}
            onExit={() => {
              onRefresh();
              setPhase('done');
            }}
            onCurrentWordChange={onCurrentWordChange}
          />
        )}

        {phase === 'done' && (
          <GroupDone
            stats={groupStats}
            onViewList={handleViewList}
            onNextGroup={handleNextGroup}
            onFinish={handleFinish}
          />
        )}
      </div>

      {/* 单词列表 Drawer */}
      {showWordList && (
        <WordListDrawer
          bookId={bookId}
          words={queue}
          onClose={() => setShowWordList(false)}
          onJumpToWord={handleJumpToWord}
        />
      )}
    </div>
  );
}
