import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  addWordToBook,
  ensureSeedData,
  exportDatabase,
  getBooks,
  getCalendarStats,
  getDueWordIdsByBook,
  getRecentDailyStats,
  getSM2CardsByBook,
  getStreakDays,
  getTodayTaskSummary,
  getTodayStats,
  getUnlockedAchievements,
  getWordsByBook,
  importDatabase,
  resetDatabase,
  unlockAchievement,
  updateWordFavorite,
} from './db';
import {
  applyAppearance,
  applyTheme,
  loadSettings,
  markOnboardingDone,
  resolveWallpaperImage,
  saveSettings,
  shouldShowOnboarding,
} from './settings';
import type {
  AchievementRecord,
  AppSettings,
  Book,
  DailyStatsRecord,
  SM2CardRecord,
  TabKey,
  TodayTaskSummary,
  Toast,
  WordCard,
} from './types';
import { createDownload } from './utils';
import { computeUserStats, getNewlyUnlocked } from './achievements';
import { AchievementUnlockModal } from './components/AchievementUnlockModal';
import { BottomNav } from './components/BottomNav';
import { CardsPage } from './components/CardsPage';
import { LibraryPage } from './components/LibraryPage';
import { OfflineBanner } from './components/OfflineBanner';
import { OnboardingModal } from './components/OnboardingModal';
import { SettingsPanel } from './components/SettingsPanel';
import { StatsPanel } from './components/StatsPanel';
import { TestModePage } from './components/TestModePage';
import { ToastCenter } from './components/ToastCenter';
import { WeakWordsView } from './components/WeakWordsView';
import { TopNav } from './components/TopNav';
import { LearnModePage } from './components/learn/LearnModePage';
import { AIAssistantButton } from './components/AIAssistant/AIAssistantButton';
import { ChatDrawer } from './components/AIAssistant/ChatDrawer';
import { useAIAssistant } from './components/AIAssistant/aiAssistantContextStore';
import { DesktopSidebar } from './components/DesktopSidebar';
import { ReadingPage } from './components/ReadingPage';

const DESKTOP_LAYOUT_QUERY = '(min-width: 1024px)';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'linguaflash.desktopSidebarCollapsed';
const EMPTY_TASK_SUMMARY: TodayTaskSummary = {
  newCount: 0,
  reviewCount: 0,
  weakCount: 0,
  outputCount: 0,
  suggestedAction: 'done',
  headline: '当前还没有学习任务',
  subline: '先导入一组单词，任务中心就会自动生成今天的学习建议。',
};

function getPageTitle(tab: TabKey): string {
  if (tab === 'cards') return '记忆卡片';
  if (tab === 'learn') return '背词模式';
  if (tab === 'en2zh') return 'EN→ZH 测试';
  if (tab === 'zh2en') return 'ZH→EN 测试';
  if (tab === 'reading') return '新闻阅读';
  return '词库';
}

interface PageStackProps {
  activeTab: TabKey;
  childrenMap: Record<TabKey, ReactNode>;
}

function PageStack({ activeTab, childrenMap }: PageStackProps) {
  return (
    <div key={activeTab} className="page-layer active page-enter">
      {childrenMap[activeTab]}
    </div>
  );
}

function App() {
  const { setCurrentWordFromCard } = useAIAssistant();
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => window.matchMedia(DESKTOP_LAYOUT_QUERY).matches);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('cards');
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [words, setWords] = useState<WordCard[]>([]);
  const [sm2Cards, setSm2Cards] = useState<SM2CardRecord[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [openUploaderSignal, setOpenUploaderSignal] = useState(0);
  const [jumpWordId, setJumpWordId] = useState<number | null>(null);
  const [pendingTabAfterSettings, setPendingTabAfterSettings] = useState<TabKey | null>(null);
  const [modelKeyMissing, setModelKeyMissing] = useState(false);
  const [ocrKeyMissing, setOcrKeyMissing] = useState(false);
  const [exaKeyMissing, setExaKeyMissing] = useState(false);
  const [dueWordIds, setDueWordIds] = useState<number[]>([]);
  const [taskSummary, setTaskSummary] = useState<TodayTaskSummary>(EMPTY_TASK_SUMMARY);
  const [showWeakWords, setShowWeakWords] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [streakDays, setStreakDays] = useState(0);
  const [todayStats, setTodayStats] = useState<DailyStatsRecord | null>(null);
  const [calendarStats, setCalendarStats] = useState<Array<{ dateKey: string; count: number }>>([]);
  const [recentStats, setRecentStats] = useState<DailyStatsRecord[]>([]);
  const [achievements, setAchievements] = useState<AchievementRecord[]>([]);
  const [pendingAchievementId, setPendingAchievementId] = useState<string | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<'offline' | 'online' | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const nextToastId = useRef(1);
  const activeBookIdRef = useRef(activeBookId);
  activeBookIdRef.current = activeBookId;

  const notify = useCallback((type: Toast['type'], message: string, duration = 3000) => {
    const id = nextToastId.current;
    nextToastId.current += 1;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const loadDerivedStats = useCallback(async (bookId: string | null) => {
    if (!bookId) {
      setSm2Cards([]);
      setDueWordIds([]);
      setTaskSummary(EMPTY_TASK_SUMMARY);
      return;
    }

    const [cards, dueIds, tasks, streak, today, calendar, recent, unlocked] = await Promise.all([
      getSM2CardsByBook(bookId),
      getDueWordIdsByBook(bookId),
      getTodayTaskSummary(bookId),
      getStreakDays(),
      getTodayStats(),
      getCalendarStats(84),
      getRecentDailyStats(7),
      getUnlockedAchievements(),
    ]);

    setSm2Cards(cards);
    setDueWordIds(dueIds);
    setTaskSummary(tasks);
    setStreakDays(streak);
    setTodayStats(today);
    setCalendarStats(calendar);
    setRecentStats(recent);
    setAchievements(unlocked);
  }, []);

  const refreshBooks = useCallback(async () => {
    const rows = await getBooks();
    setBooks(rows);

    if (!rows.length) {
      setActiveBookId(null);
      setWords([]);
      setCardIndex(0);
      await loadDerivedStats(null);
      return;
    }

    const currentBookId = activeBookIdRef.current;
    const nextBookId =
      currentBookId && rows.some((book) => book.id === currentBookId) ? currentBookId : rows[0].id;

    setActiveBookId(nextBookId);
    const wordRows = await getWordsByBook(nextBookId);
    setWords(wordRows);
    await loadDerivedStats(nextBookId);
  }, [loadDerivedStats]);

  const handleSelectBook = useCallback((bookId: string) => {
    setActiveBookId(bookId);
    setCardIndex(0);
    setReviewMode(false);
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
    applyAppearance(settings.appearance);
  }, [settings]);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_LAYOUT_QUERY);
    const listener = (event: MediaQueryListEvent) => {
      setIsDesktopLayout(event.matches);
    };

    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      // ignore quota/private mode errors
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!bgMusicRef.current) {
      bgMusicRef.current = new Audio();
      bgMusicRef.current.loop = true;
    }

    const audio = bgMusicRef.current;
    audio.volume = settings.bgMusic.volume;
    if (settings.bgMusic.base64) {
      audio.src = settings.bgMusic.base64;
    }

    if (settings.bgMusic.enabled && settings.bgMusic.base64) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [settings.bgMusic]);

  useEffect(() => {
    void ensureSeedData()
      .then(refreshBooks)
      .catch((error) => {
        window.alert(`IndexedDB 初始化失败：${error instanceof Error ? error.message : '未知错误'}`);
      });
  }, [refreshBooks]);

  useEffect(() => {
    setShowOnboarding(shouldShowOnboarding());
  }, [settings]);

  useEffect(() => {
    if (!activeBookId) {
      setWords([]);
      return;
    }

    let isStale = false;

    void getWordsByBook(activeBookId)
      .then((rows) => {
        if (!isStale) {
          setWords(rows);
        }
      })
      .catch((error) => {
        if (!isStale) {
          window.alert(`读取单词失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
      });

    void loadDerivedStats(activeBookId);

    return () => {
      isStale = true;
    };
  }, [activeBookId, loadDerivedStats]);

  useEffect(() => {
    const handleOffline = () => setOnlineStatus('offline');
    const handleOnline = () => {
      setOnlineStatus('online');
      window.setTimeout(() => {
        setOnlineStatus((prev) => (prev === 'online' ? null : prev));
      }, 1500);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const statsState = useMemo(() => {
    const perfectDays = recentStats.filter((d) => d.reviewed > 0 && d.reviewDone >= d.reviewed).length;
    const fastAnswers = recentStats.reduce((sum, d) => sum + d.fastAnswers, 0);
    const nightSessions = recentStats.reduce((sum, d) => sum + d.nightSessions, 0);
    return computeUserStats({
      words,
      sm2Cards,
      streak: streakDays,
      perfectDays,
      fastAnswers,
      nightSessions,
    });
  }, [recentStats, sm2Cards, streakDays, words]);

  useEffect(() => {
    if (!words.length) {
      return;
    }
    const newly = getNewlyUnlocked(statsState, achievements);
    if (!newly.length) {
      return;
    }

    const first = newly[0];
    void unlockAchievement(first.id).then((record) => {
      setAchievements((prev) => {
        if (prev.some((item) => item.id === record.id)) {
          return prev;
        }
        return [...prev, record];
      });
      setPendingAchievementId(first.id);
      notify('success', `成就解锁：${first.title}`);
    });
  }, [achievements, notify, statsState, words.length]);

  const activeTitle = useMemo(() => getPageTitle(activeTab), [activeTab]);
  const wallpaperImage = useMemo(
    () => resolveWallpaperImage(settings.appearance),
    [settings.appearance],
  );
  const updateSettings = (next: AppSettings) => setSettings(next);

  const handleOnboardingComplete = (partial: Partial<AppSettings>) => {
    const updated = saveSettings(partial);
    setSettings(updated);
    markOnboardingDone();
    setShowOnboarding(false);
    notify('success', '欢迎使用 LinguaFlash');
  };

  const handleToggleFavorite = async (word: WordCard) => {
    if (!word.id) {
      return;
    }

    try {
      await updateWordFavorite(word.id, !word.favorited);
      if (activeBookId) {
        const rows = await getWordsByBook(activeBookId);
        setWords(rows);
      }
      notify('success', word.favorited ? '已取消收藏' : '已收藏');
    } catch {
      notify('error', '收藏操作失败');
    }
  };

  const handleTabChange = (tab: TabKey) => {
    if ((tab === 'en2zh' || tab === 'zh2en' || tab === 'reading') && !settings.llm.apiKey.trim()) {
      notify('error', 'API Key 未配置，请先到设置中填写 LLM API Key');
      setShowSettings(true);
      setPendingTabAfterSettings(tab);
      setModelKeyMissing(true);
      setOcrKeyMissing(false);
      setExaKeyMissing(false);
      return;
    }

    setReviewMode(false);
    setActiveTab(tab);
  };

  const openUploader = () => {
    if (!settings.ocr.apiKey?.trim()) {
      notify('error', 'OCR API Key 未配置，请先在设置页补充');
      setShowSettings(true);
      setPendingTabAfterSettings(null);
      setModelKeyMissing(false);
      setOcrKeyMissing(true);
      setExaKeyMissing(false);
      return;
    }
    setActiveTab('library');
    setOpenUploaderSignal((prev) => prev + 1);
  };

  const handleExport = async () => {
    try {
      const data = await exportDatabase();
      const fileName = `linguaflash-export-${new Date().toISOString().slice(0, 10)}.json`;
      createDownload(fileName, JSON.stringify(data, null, 2));
      notify('success', '已导出词库 JSON');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '导出失败');
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await importDatabase(parsed);
      await refreshBooks();
      notify('success', '导入成功');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '导入失败');
    }
  };

  const closeSettings = () => {
    setShowSettings(false);

    const llmReady = Boolean(settings.llm.apiKey.trim());

    if (pendingTabAfterSettings === 'reading' && llmReady) {
      setReviewMode(false);
      setActiveTab('reading');
    }

    if (
      (pendingTabAfterSettings === 'en2zh' || pendingTabAfterSettings === 'zh2en') &&
      llmReady
    ) {
      setReviewMode(false);
      setActiveTab(pendingTabAfterSettings);
    }

    if (ocrKeyMissing && settings.ocr.apiKey?.trim()) {
      setActiveTab('library');
      setOpenUploaderSignal((prev) => prev + 1);
    }

    setPendingTabAfterSettings(null);
    setModelKeyMissing(false);
    setOcrKeyMissing(false);
    setExaKeyMissing(false);
  };

  const handleResetData = async () => {
    if (!window.confirm('确认清空全部词库和复习记录？')) {
      return;
    }

    try {
      await resetDatabase();
      await ensureSeedData();
      await refreshBooks();
      notify('success', '已重置数据');
    } catch (error) {
      window.alert(
        `IndexedDB 存储失败：${error instanceof Error ? error.message : '存储空间不足或未知错误'}`,
      );
    }
  };

  const reviewWords = useMemo(() => {
    if (!reviewMode || !dueWordIds.length) {
      return words;
    }
    const dueSet = new Set(dueWordIds);
    return words.filter((word) => word.id && dueSet.has(word.id));
  }, [dueWordIds, reviewMode, words]);

  const handleQuickAddWord = useCallback(
    async (payload: Omit<WordCard, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>, targetBookId?: string) => {
      const bookId = targetBookId ?? activeBookId;
      if (!bookId) {
        notify('error', '请先选择分组');
        return;
      }
      const result = await addWordToBook(bookId, payload, 'skip');
      if (result.status === 'skipped') {
        notify('warning', '该单词已存在于当前分组');
      } else {
        notify('success', '单词已添加');
      }
      await refreshBooks();
    },
    [activeBookId, notify, refreshBooks],
  );

  useEffect(() => {
    if (activeTab === 'library' || activeTab === 'reading') {
      setCurrentWordFromCard(null, 'unknown', activeBookId);
    }
  }, [activeBookId, activeTab, setCurrentWordFromCard]);

  const handleCardsCurrentWordChange = useCallback(
    (word: WordCard | null) => {
      setCurrentWordFromCard(word, 'cards', activeBookId);
    },
    [activeBookId, setCurrentWordFromCard],
  );

  const handleLearnCurrentWordChange = useCallback(
    (word: WordCard | null) => {
      setCurrentWordFromCard(word, 'learn', activeBookId);
    },
    [activeBookId, setCurrentWordFromCard],
  );

  const handleTestCurrentWordChange = useCallback(
    (word: WordCard | null) => {
      setCurrentWordFromCard(word, 'test', activeBookId);
    },
    [activeBookId, setCurrentWordFromCard],
  );

  const childrenMap: Record<TabKey, ReactNode> = {
    cards: (
      <CardsPage
        books={books}
        activeBookId={activeBookId}
        words={reviewWords}
        cardIndex={cardIndex}
        settings={settings}
        jumpWordId={jumpWordId}
        taskSummary={taskSummary}
        activeTaskMode={reviewMode ? (activeTab === 'zh2en' ? 'output' : 'review') : null}
        goalsProgress={{
          newDone: todayStats?.newWordsDone ?? 0,
          reviewDone: todayStats?.reviewDone ?? 0,
          newTarget: settings.goals.dailyNewWords,
          reviewTarget: settings.goals.dailyReviewWords,
        }}
        onStartTodayReview={() => {
          setReviewMode(true);
          setCardIndex(0);
          setActiveTab('en2zh');
        }}
        onStopTodayReview={() => setReviewMode(false)}
        onStartLearn={() => {
          setReviewMode(false);
          setActiveTab('learn');
        }}
        onStartOutputPractice={() => {
          setReviewMode(true);
          setCardIndex(0);
          setActiveTab('zh2en');
        }}
        onEnterWeakWords={() => setShowWeakWords(true)}
        onJumpHandled={() => setJumpWordId(null)}
        onSelectBook={handleSelectBook}
        onCardIndexChange={setCardIndex}
        onOpenUploader={openUploader}
        onToggleFavorite={handleToggleFavorite}
        onCurrentWordChange={handleCardsCurrentWordChange}
      />
    ),
    learn: (
      <LearnModePage
        bookId={activeBookId}
        settings={settings}
        onNotify={notify}
        onBackToCards={() => setActiveTab('cards')}
        onRefresh={() => void refreshBooks()}
        onCurrentWordChange={handleLearnCurrentWordChange}
      />
    ),
    en2zh: (
      <TestModePage
        mode="en2zh"
        words={reviewWords}
        settings={settings}
        bookId={activeBookId}
        onBackHome={() => {
          setReviewMode(false);
          setActiveTab('cards');
        }}
        onRefresh={() => void refreshBooks()}
        onCurrentWordChange={handleTestCurrentWordChange}
      />
    ),
    zh2en: (
      <TestModePage
        mode="zh2en"
        words={reviewWords}
        settings={settings}
        bookId={activeBookId}
        onBackHome={() => {
          setReviewMode(false);
          setActiveTab('cards');
        }}
        onRefresh={() => void refreshBooks()}
        onCurrentWordChange={handleTestCurrentWordChange}
      />
    ),
    reading: (
      <ReadingPage
        settings={settings}
        activeBookName={books.find((book) => book.id === activeBookId)?.name ?? null}
        onNotify={notify}
        onAddKeyword={(word) => handleQuickAddWord(word)}
      />
    ),
    library: (
      <LibraryPage
        books={books}
        activeBookId={activeBookId}
        words={words}
        settings={settings}
        onSelectBook={handleSelectBook}
        onJumpToWord={(wordId) => {
          setJumpWordId(wordId);
          setReviewMode(false);
          setActiveTab('cards');
        }}
        onRefresh={refreshBooks}
        onNotify={notify}
        onQuickAddWord={handleQuickAddWord}
        openUploaderSignal={openUploaderSignal}
      />
    ),
  };

  return (
    <div
      className={`app-root-shell ${isDesktopLayout ? 'desktop-shell' : ''} ${
        isDesktopLayout && sidebarCollapsed ? 'sidebar-collapsed' : ''
      }`}
    >
      <div className="wallpaper-layer" style={{ backgroundImage: wallpaperImage }} />
      <div className="wallpaper-overlay" />

      <div className="app-root">
        <OfflineBanner status={onlineStatus} />

        {isDesktopLayout ? (
          <DesktopSidebar
            activeTab={activeTab}
            onChange={handleTabChange}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
          />
        ) : null}

        <div className="app-main">
          <TopNav
            title={activeTitle}
            streakDays={streakDays}
            onOpenStats={() => setShowStats(true)}
            onOpenSettings={() => setShowSettings(true)}
          />

          <main className="content-area">
            <PageStack activeTab={activeTab} childrenMap={childrenMap} />
          </main>
        </div>

        {!isDesktopLayout ? <BottomNav activeTab={activeTab} onChange={handleTabChange} /> : null}
      </div>

      <StatsPanel
        open={showStats}
        onClose={() => setShowStats(false)}
        bookId={activeBookId}
        words={words}
        sm2Cards={sm2Cards}
        calendarStats={calendarStats}
        recentStats={recentStats}
        streakDays={streakDays}
        todayLearned={todayStats?.learned ?? 0}
        todayReviewed={todayStats?.reviewed ?? 0}
        goalsProgress={{
          newDone: todayStats?.newWordsDone ?? 0,
          reviewDone: todayStats?.reviewDone ?? 0,
          newTarget: settings.goals.dailyNewWords,
          reviewTarget: settings.goals.dailyReviewWords,
        }}
        achievements={achievements}
        onJumpToWord={(wordId) => {
          setJumpWordId(wordId);
          setShowStats(false);
          setActiveTab('cards');
        }}
      />

      <AchievementUnlockModal
        achievementId={pendingAchievementId}
        onClose={() => setPendingAchievementId(null)}
      />

      {showWeakWords ? (
        <WeakWordsView
          bookId={activeBookId}
          settings={settings}
          onBack={() => {
            setShowWeakWords(false);
            void refreshBooks(); // Refresh to update weak words count
          }}
        />
      ) : null}

      {showSettings ? (
        <SettingsPanel
          settings={settings}
          initialGroup={
            modelKeyMissing ? 'model' : exaKeyMissing ? 'exa' : ocrKeyMissing ? 'ocr' : undefined
          }
          highlightModel={modelKeyMissing}
          highlightExa={exaKeyMissing}
          highlightOcr={ocrKeyMissing}
          onSettingsChange={updateSettings}
          onClose={closeSettings}
          onExport={() => void handleExport()}
          onImport={(file) => void handleImport(file)}
          onResetData={() => void handleResetData()}
          notify={notify}
        />
      ) : null}

      {showOnboarding ? (
        <OnboardingModal settings={settings} onComplete={handleOnboardingComplete} />
      ) : null}

      {settings.aiAssistant.enabled ? <AIAssistantButton settings={settings.aiAssistant} /> : null}
      {settings.aiAssistant.enabled ? <ChatDrawer settings={settings} /> : null}

      <ToastCenter toasts={toasts} onClose={removeToast} />
    </div>
  );
}

export default App;
