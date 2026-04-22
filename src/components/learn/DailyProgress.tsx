// src/components/learn/DailyProgress.tsx
import { useEffect, useState } from 'react';
import type { AppSettings } from '../../types';
import { getTodayStats, getStreakDays } from '../../db';

interface Props {
  settings: AppSettings;
}

export function DailyProgress({ settings }: Props) {
  const [learned, setLearned] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [streak, setStreak] = useState(0);
  const [goal] = useState(settings.goals.dailyNewWords);

  useEffect(() => {
    const loadStats = async () => {
      const [todayStats, streakDays] = await Promise.all([
        getTodayStats(),
        getStreakDays(),
      ]);
      setLearned(todayStats?.newWordsDone || 0);
      setReviewed(todayStats?.reviewDone || 0);
      setStreak(streakDays);
    };
    loadStats();
  }, []);

  const progress = Math.min((learned / goal) * 100, 100);
  const isOverGoal = learned >= goal;

  return (
    <div className={`daily-progress-card ${isOverGoal ? 'completed' : ''}`}>
      <div className="daily-progress-header">
        <span className="daily-progress-title">今日任务</span>
        <span className={`daily-progress-count ${isOverGoal ? 'over-goal' : ''}`}>
          {learned} / {goal} 个
        </span>
      </div>

      <div className="daily-progress-bar-wrap">
        <div
          className="daily-progress-bar"
          style={{
            width: `${progress}%`,
            background: isOverGoal
              ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
              : 'linear-gradient(90deg, #6366F1, #818CF8)',
          }}
        />
        {isOverGoal && <div className="particle-animation" />}
      </div>

      <div className="daily-progress-footer">
        <span className="streak-badge-small">
          🔥 连续 {streak} 天打卡
        </span>
        <span className="today-summary">
          已学 {learned} 个新词，复习 {reviewed} 个
        </span>
      </div>
    </div>
  );
}
