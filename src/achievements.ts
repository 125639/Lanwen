import type { AchievementRecord, SM2CardRecord, WordCard } from './types';

export interface UserStats {
  totalWords: number;
  masteredWords: number;
  streak: number;
  perfectDays: number;
  fastAnswers: number;
  nightSessions: number;
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
  condition: (stats: UserStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_word',
    title: '破冰',
    description: '学习第一个单词',
    icon: '🧊',
    tier: 'bronze',
    condition: (s) => s.totalWords >= 1,
  },
  {
    id: 'ten_words',
    title: '初学者',
    description: '掌握 10 个单词',
    icon: '📚',
    tier: 'bronze',
    condition: (s) => s.masteredWords >= 10,
  },
  {
    id: 'hundred_words',
    title: '词汇猎手',
    description: '掌握 100 个单词',
    icon: '🎯',
    tier: 'silver',
    condition: (s) => s.masteredWords >= 100,
  },
  {
    id: 'streak_7',
    title: '一周坚持',
    description: '连续打卡 7 天',
    icon: '🔥',
    tier: 'silver',
    condition: (s) => s.streak >= 7,
  },
  {
    id: 'streak_30',
    title: '月度达人',
    description: '连续打卡 30 天',
    icon: '💎',
    tier: 'gold',
    condition: (s) => s.streak >= 30,
  },
  {
    id: 'perfect_day',
    title: '完美一天',
    description: '一天内全部答对',
    icon: '⭐',
    tier: 'silver',
    condition: (s) => s.perfectDays >= 1,
  },
  {
    id: 'speed_demon',
    title: '闪电侠',
    description: '10 秒内回答 5 个单词',
    icon: '⚡',
    tier: 'bronze',
    condition: (s) => s.fastAnswers >= 5,
  },
  {
    id: 'night_owl',
    title: '夜猫子',
    description: '凌晨 0 点后学习',
    icon: '🦉',
    tier: 'bronze',
    condition: (s) => s.nightSessions >= 1,
  },
];

export function computeUserStats(params: {
  words: WordCard[];
  sm2Cards: SM2CardRecord[];
  streak: number;
  perfectDays: number;
  fastAnswers: number;
  nightSessions: number;
}): UserStats {
  const masteredWords = params.sm2Cards.filter((c) => c.masteryLevel === 3).length;
  return {
    totalWords: params.words.length,
    masteredWords,
    streak: params.streak,
    perfectDays: params.perfectDays,
    fastAnswers: params.fastAnswers,
    nightSessions: params.nightSessions,
  };
}

export function getNewlyUnlocked(
  stats: UserStats,
  unlocked: AchievementRecord[],
): AchievementDefinition[] {
  const unlockedSet = new Set(unlocked.map((a) => a.id));
  return ACHIEVEMENTS.filter((a) => !unlockedSet.has(a.id) && a.condition(stats));
}
