import { useEffect, useMemo, useState } from 'react';
import { ACHIEVEMENTS } from '../achievements';
import type {
  AchievementRecord,
  DailyStatsRecord,
  ReviewLog,
  ReviewWrongReason,
  SM2CardRecord,
  WordCard,
} from '../types';
import { getDailyStatsRange, getMasteryDistribution, getTodayReviewLogs, getVocabGrowthData } from '../db';
import { TrendLineChart, type TrendDataPoint } from './charts/TrendLineChart';
import { VocabGrowthChart } from './charts/VocabGrowthChart';
import { MasteryDonutChart, type MasteryData } from './charts/MasteryDonutChart';
import { formatDateLabel } from '../chartConfig';

type Range = 7 | 14 | 30;

interface StatsPanelProps {
  open: boolean;
  onClose: () => void;
  bookId: string | null;
  words: WordCard[];
  sm2Cards: SM2CardRecord[];
  calendarStats: Array<{ dateKey: string; count: number }>;
  recentStats: DailyStatsRecord[];
  streakDays: number;
  todayLearned: number;
  todayReviewed: number;
  goalsProgress: {
    newDone: number;
    reviewDone: number;
    newTarget: number;
    reviewTarget: number;
  };
  achievements: AchievementRecord[];
  onJumpToWord: (wordId: number) => void;
}

function getMasteryCount(sm2Cards: SM2CardRecord[]) {
  const map = { mastered: 0, familiar: 0, learning: 0, fresh: 0 };
  for (const card of sm2Cards) {
    if (card.masteryLevel === 3) map.mastered += 1;
    else if (card.masteryLevel === 2) map.familiar += 1;
    else if (card.masteryLevel === 1) map.learning += 1;
    else map.fresh += 1;
  }
  return map;
}

function getMaxCount(stats: DailyStatsRecord[]): number {
  return Math.max(1, ...stats.map((s) => s.learned + s.reviewed));
}

const WRONG_REASON_LABELS: Record<ReviewWrongReason, string> = {
  meaning: '词义不会',
  confusion: '近义混淆',
  spelling: '拼写不会',
  usage: '用法不会',
};

export function StatsPanel({
  open,
  onClose,
  bookId,
  words,
  sm2Cards,
  calendarStats,
  recentStats,
  streakDays,
  todayLearned,
  todayReviewed,
  goalsProgress,
  achievements,
  onJumpToWord,
}: StatsPanelProps) {
  const [range, setRange] = useState<Range>(30);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [vocabData, setVocabData] = useState<Array<{ date: string; label: string; total: number; added: number }>>([]);
  const [masteryData, setMasteryData] = useState<MasteryData | null>(null);
  const [todayLogs, setTodayLogs] = useState<ReviewLog[]>([]);
  const [chartsLoading, setChartsLoading] = useState(true);

  // Load recharts data
  useEffect(() => {
    if (!open) return;
    setChartsLoading(true);
    Promise.all([
      getDailyStatsRange(range),
      getVocabGrowthData(range),
      getMasteryDistribution(),
    ]).then(([daily, vocab, mastery]) => {
      setTrendData(
        daily.map((d) => ({ ...d, label: formatDateLabel(d.dateKey) })),
      );
      setVocabData(
        vocab.map((d) => ({ ...d, label: formatDateLabel(d.date) })),
      );
      setMasteryData(mastery);
      setChartsLoading(false);
    });
  }, [range, open]);

  useEffect(() => {
    if (!open) return;
    void getTodayReviewLogs(bookId).then(setTodayLogs);
  }, [bookId, open]);

  const mastery = useMemo(() => getMasteryCount(sm2Cards), [sm2Cards]);
  const totalCards = Math.max(1, sm2Cards.length);
  const unlockedSet = useMemo(() => new Set(achievements.map((a) => a.id)), [achievements]);

  const hardestWords = useMemo(() => {
    const cardMap = new Map<number, SM2CardRecord>();
    sm2Cards.forEach((card) => {
      cardMap.set(card.wordId, card);
    });
    return words
      .map((word) => ({
        word,
        sm2: word.id ? cardMap.get(word.id) : undefined,
      }))
      .filter((item): item is { word: WordCard; sm2: SM2CardRecord } => Boolean(item.sm2 && item.word.id))
      .sort((a, b) => {
        if (a.sm2.wrongCount !== b.sm2.wrongCount) {
          return b.sm2.wrongCount - a.sm2.wrongCount;
        }
        return a.sm2.easeFactor - b.sm2.easeFactor;
      })
      .slice(0, 5);
  }, [sm2Cards, words]);

  const maxDaily = getMaxCount(recentStats);
  const todayDate = new Date();
  const todayIso = todayDate.toISOString().slice(0, 10);
  const todayLabel = `${todayDate.getMonth() + 1}/${todayDate.getDate()}`;
  const masteredRate = Math.round((mastery.mastered / totalCards) * 100);
  const monthlyLabel = `${new Date().toLocaleString('en-US', { month: 'short' })} ${new Date().getFullYear()}`;
  const todayFailedLogs = useMemo(
    () => todayLogs.filter((log) => log.result === 'hard' || (log.grade ?? 5) < 3),
    [todayLogs],
  );
  const todayWrongReasons = useMemo(() => {
    const counts = new Map<ReviewWrongReason, number>();
    for (const log of todayFailedLogs) {
      const reason = log.wrongReason;
      if (!reason) {
        continue;
      }
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count, label: WRONG_REASON_LABELS[reason] }));
  }, [todayFailedLogs]);
  const todayFocusWords = useMemo(() => {
    const wordMap = new Map<number, WordCard>();
    words.forEach((word) => {
      if (typeof word.id === 'number') {
        wordMap.set(word.id, word);
      }
    });

    const aggregate = new Map<number, { count: number; reason?: ReviewWrongReason }>();
    for (const log of todayFailedLogs) {
      const current = aggregate.get(log.wordId) ?? { count: 0, reason: log.wrongReason };
      aggregate.set(log.wordId, {
        count: current.count + 1,
        reason: current.reason ?? log.wrongReason,
      });
    }

    return [...aggregate.entries()]
      .map(([wordId, meta]) => ({
        wordId,
        word: wordMap.get(wordId),
        count: meta.count,
        reason: meta.reason,
      }))
      .filter((item) => Boolean(item.word))
      .map((item) => ({
        wordId: item.wordId,
        word: item.word as WordCard,
        count: item.count,
        reason: item.reason,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [todayFailedLogs, words]);
  const examProgress = useMemo(() => {
    const cardMap = new Map<number, SM2CardRecord>();
    sm2Cards.forEach((card) => cardMap.set(card.wordId, card));

    const progressMap = new Map<string, { total: number; mastered: number }>();
    for (const word of words) {
      const tags = word.level_tag?.length ? word.level_tag : ['未分类'];
      const card = typeof word.id === 'number' ? cardMap.get(word.id) : undefined;
      const mastered = (card?.masteryLevel ?? word.masteryLevel ?? 0) >= 2;

      for (const tag of tags) {
        const current = progressMap.get(tag) ?? { total: 0, mastered: 0 };
        current.total += 1;
        if (mastered) {
          current.mastered += 1;
        }
        progressMap.set(tag, current);
      }
    }

    return [...progressMap.entries()]
      .map(([tag, item]) => ({
        tag,
        total: item.total,
        mastered: item.mastered,
        percent: item.total ? Math.round((item.mastered / item.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [sm2Cards, words]);
  const recapSuggestion = useMemo(() => {
    const topReason = todayWrongReasons[0];
    if (!topReason) {
      return '今天的表现比较稳定。建议继续保持复习节奏，或者从阅读关键词里补充新词。';
    }

    if (topReason.reason === 'spelling') {
      return '今天主要卡在拼写输出。下一轮优先做 ZH→EN，或者从错词本里集中练输出。';
    }

    if (topReason.reason === 'usage') {
      return '今天主要卡在用法和例句。建议把重点词放进句子练习里再过一遍。';
    }

    if (topReason.reason === 'confusion') {
      return '今天更容易和近义词混淆。建议回到卡片页，对薄弱词逐个看释义差异。';
    }

    return '今天主要卡在词义回忆。建议先清掉错词，再进入下一轮新词学习。';
  }, [todayWrongReasons]);

  if (!open) return null;

  return (
    <div className="stats-panel-overlay" onClick={onClose}>
      <div className="stats-panel" onClick={(e) => e.stopPropagation()}>
        {/* 顶部导航 */}
        <header className="stats-panel-header">
          <h2>学习统计</h2>
          <button className="top-nav-btn" onClick={onClose} title="关闭">✕</button>
        </header>

        <div className="stats-scroll">
          {/* 概览卡片 */}
          <section className="hero-summary-card">
            <div className="hero-date">{todayLabel}</div>
            <div className="hero-grid">
              <div>
                <small>今日学习</small>
                <strong>{todayLearned}</strong>
              </div>
              <div>
                <small>今日复习</small>
                <strong>{todayReviewed}</strong>
              </div>
              <div>
                <small>掌握率</small>
                <strong>{masteredRate}%</strong>
              </div>
              <div>
                <small>连续打卡</small>
                <strong className={`streak-value ${streakDays >= 7 ? 'hot' : ''}`}>{streakDays} 天 🔥</strong>
              </div>
            </div>
          </section>

          <section className="stats-section-card today-recap-card">
            <div className="stats-title-row">
              <h3>今日复盘</h3>
              <span>{todayFailedLogs.length ? '有重点要巩固' : '状态稳定'}</span>
            </div>
            <p className="today-recap-copy">{recapSuggestion}</p>
            {todayWrongReasons.length ? (
              <div className="today-reason-chips">
                {todayWrongReasons.map((item) => (
                  <span key={item.reason} className="today-reason-chip">
                    {item.label} {item.count}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted-empty">今天还没有记录到明显薄弱点。</p>
            )}

            {todayFocusWords.length ? (
              <div className="today-focus-list">
                {todayFocusWords.map((item) => (
                  <button
                    type="button"
                    className="tap today-focus-item"
                    key={item.wordId}
                    onClick={() => {
                      onJumpToWord(item.wordId);
                      onClose();
                    }}
                  >
                    <div>
                      <strong>{item.word.word}</strong>
                      <small>{item.reason ? WRONG_REASON_LABELS[item.reason] : '需要再看一遍'}</small>
                    </div>
                    <span>今天卡了 {item.count} 次</span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          {/* 时间范围切换 */}
          <div className="stats-range-tabs">
            {([7, 14, 30] as Range[]).map((r) => (
              <button
                key={r}
                className={`stats-range-tab ${range === r ? 'active' : ''}`}
                onClick={() => setRange(r)}
              >
                {r} 天
              </button>
            ))}
          </div>

          {chartsLoading ? (
            <div className="stats-loading">
              <div className="skeleton" style={{ height: 220, borderRadius: 16, marginBottom: 16 }} />
              <div className="skeleton" style={{ height: 200, borderRadius: 16, marginBottom: 16 }} />
              <div className="skeleton" style={{ height: 180, borderRadius: 16 }} />
            </div>
          ) : (
            <>
              {/* 卡片一：学习趋势 */}
              <section className="stats-card">
                <div className="stats-card-header">
                  <h3>学习趋势</h3>
                  <span className="stats-card-sub">新学 & 复习单词数</span>
                </div>
                <TrendLineChart data={trendData} />
              </section>

              {/* 卡片二：词汇增长 */}
              <section className="stats-card">
                <div className="stats-card-header">
                  <h3>词汇增长曲线</h3>
                  <span className="stats-card-sub">累计词汇量变化</span>
                </div>
                <VocabGrowthChart data={vocabData} />
              </section>

              {/* 卡片三：掌握度分布 */}
              <section className="stats-card">
                <div className="stats-card-header">
                  <h3>掌握度分布</h3>
                  <span className="stats-card-sub">全部单词当前状态</span>
                </div>
                <div className="mastery-donut-layout">
                  {masteryData && <MasteryDonutChart data={masteryData} size={200} />}
                </div>
              </section>
            </>
          )}

          {/* 原有功能：学习记录热力图 */}
          <section className="stats-section-card">
            <div className="stats-title-row">
              <h3>学习记录</h3>
              <span>过去 12 周</span>
            </div>
            <div className="calendar-grid-wrap">
              <div className="calendar-month-label">{monthlyLabel}</div>
              <div className="calendar-grid">
                {calendarStats.map((item) => {
                  const isToday = item.dateKey === todayIso;
                  const levelClass =
                    item.count === 0
                      ? 'empty'
                      : item.count <= 5
                        ? 'low'
                        : item.count <= 15
                          ? 'mid'
                          : 'high';
                  return (
                    <div
                      key={item.dateKey}
                      className={`calendar-cell ${levelClass} ${isToday ? 'today' : ''}`}
                      title={`${item.dateKey} · 学了 ${item.count} 个单词`}
                    />
                  );
                })}
              </div>
              <div className="calendar-legend">少 ← □□□□ → 多</div>
            </div>
          </section>

          {/* 原有功能：单词掌握情况 */}
          <section className="stats-section-card">
            <h3>单词掌握情况</h3>
            {[
              { key: 'mastered', label: '已掌握', color: 'var(--mastery-mastered)', value: mastery.mastered },
              { key: 'familiar', label: '熟悉', color: 'var(--mastery-familiar)', value: mastery.familiar },
              { key: 'learning', label: '学习中', color: 'var(--mastery-learning)', value: mastery.learning },
              { key: 'fresh', label: '未学习', color: 'var(--mastery-new)', value: mastery.fresh },
            ].map((item, index) => {
              const percent = Math.round((item.value / totalCards) * 100);
              return (
                <div className="mastery-row" key={item.key}>
                  <div className="mastery-label">
                    <span className="mastery-dot" style={{ background: item.color }} />
                    <span>{item.label}</span>
                  </div>
                  <div className="mastery-track">
                    <div
                      className="mastery-fill"
                      style={{
                        ['--final-width' as string]: `${percent}%`,
                        background: item.color,
                        animationDelay: `${index * 100}ms`,
                      }}
                    />
                  </div>
                  <div className="mastery-meta">
                    {item.value}个 {percent}%
                  </div>
                </div>
              );
            })}
          </section>

          <section className="stats-section-card exam-progress-card">
            <div className="stats-title-row">
              <h3>考试标签进度</h3>
              <span>按熟悉 / 掌握统计</span>
            </div>
            {examProgress.length ? (
              <div className="exam-progress-list">
                {examProgress.map((item) => (
                  <div className="exam-progress-row" key={item.tag}>
                    <div className="exam-progress-meta">
                      <strong>{item.tag}</strong>
                      <span>
                        {item.mastered}/{item.total}
                      </span>
                    </div>
                    <div className="exam-progress-track">
                      <div className="exam-progress-fill" style={{ width: `${item.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-empty">当前词书还没有考试标签数据。</p>
            )}
          </section>

          {/* 原有功能：近 7 天学习量 */}
          <section className="stats-section-card">
            <h3>近 7 天学习量</h3>
            <div className="weekly-bars">
              {recentStats.map((item, index) => {
                const value = item.learned + item.reviewed;
                const ratio = value / maxDaily;
                const isToday = item.dateKey === todayIso;
                return (
                  <div className="weekly-bar-col" key={item.dateKey}>
                    <div className="weekly-bar-wrap" title={`${item.dateKey} · ${value} 个`}>
                      <div
                        className={`weekly-bar ${isToday ? 'today' : ''}`}
                        style={{ height: `${Math.max(8, ratio * 120)}px`, animationDelay: `${index * 60}ms` }}
                      />
                    </div>
                    <small>{formatDateLabel(item.dateKey)}</small>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 原有功能：需要加强的单词 */}
          <section className="stats-section-card">
            <h3>需要加强的单词</h3>
            <div className="hardest-list">
              {hardestWords.length ? (
                hardestWords.map((item) => (
                  <button
                    type="button"
                    className="tap hardest-item"
                    key={item.word.id}
                    onClick={() => {
                      if (item.word.id) onJumpToWord(item.word.id);
                      onClose();
                    }}
                  >
                    <div>
                      <span className="hard-dot" />
                      <strong>{item.word.word}</strong>
                    </div>
                    <div>
                      <span className="wrong-tag">错了 {item.sm2.wrongCount} 次</span>
                      <small>EF {item.sm2.easeFactor.toFixed(2)}</small>
                    </div>
                  </button>
                ))
              ) : (
                <p className="muted-empty">暂无薄弱词，继续保持！</p>
              )}
            </div>
          </section>

          {/* 原有功能：成就徽章 */}
          <section className="stats-section-card achievements-panel">
            <h3>成就徽章</h3>
            <div className="achievements-grid">
              {ACHIEVEMENTS.map((item) => {
                const unlocked = unlockedSet.has(item.id);
                return (
                  <div className={`achievement-badge ${unlocked ? 'unlocked' : 'locked'} ${item.tier}`} key={item.id}>
                    <div className="badge-icon">{item.icon}</div>
                    <div className="badge-name">{item.title}</div>
                    <div className="badge-meta">{unlocked ? '已解锁' : '???'}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 原有功能：今日目标进度 */}
          <section className="stats-section-card goals-preview-card">
            <h3>今日目标进度</h3>
            <div className="goals-mini">
              <div>
                新词 {goalsProgress.newDone}/{goalsProgress.newTarget}
              </div>
              <div>
                复习 {goalsProgress.reviewDone}/{goalsProgress.reviewTarget}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
