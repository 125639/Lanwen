export interface SM2Card {
  wordId: number;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: number;
  masteryLevel: 0 | 1 | 2 | 3;
}

export type SM2Grade = 0 | 1 | 2 | 3 | 4 | 5;

export interface SM2ScheduleConfig {
  grade0Minutes: number;
  grade1Minutes: number;
  grade2Days: number;
  grade3Multiplier: number;
  grade4Multiplier: number;
  grade5Multiplier: number;
}

export const DEFAULT_SM2_SCHEDULE: SM2ScheduleConfig = {
  grade0Minutes: 2,
  grade1Minutes: 10,
  grade2Days: 1,
  grade3Multiplier: 1.3,
  grade4Multiplier: 2,
  grade5Multiplier: 2.5,
};

const DAY_MS = 86400000;
const MINUTE_MS = 60000;
const HOUR_MS = 3600000;
const EASE_MIN = 1.3;
const EASE_MAX = 3.2;
const MIN_INTERVAL_DAYS = 1 / 1440;
const MAX_INTERVAL_DAYS = 365;
const JITTER_RATIO = 0.05;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeScheduleConfig(partial?: Partial<SM2ScheduleConfig>): SM2ScheduleConfig {
  const merged = { ...DEFAULT_SM2_SCHEDULE, ...partial };

  return {
    grade0Minutes: clamp(merged.grade0Minutes, 1, 120),
    grade1Minutes: clamp(merged.grade1Minutes, 1, 720),
    grade2Days: clamp(merged.grade2Days, 1, 7),
    grade3Multiplier: clamp(merged.grade3Multiplier, 1.05, 2),
    grade4Multiplier: clamp(merged.grade4Multiplier, 1, 3.5),
    grade5Multiplier: clamp(merged.grade5Multiplier, 1.2, 5),
  };
}

function getEaseDelta(grade: SM2Grade): number {
  if (grade === 5) return 0.15;
  if (grade === 4) return 0;
  if (grade === 3) return -0.15;
  if (grade === 2) return -0.3;
  if (grade === 1) return -0.4;
  return -0.45;
}

export function sm2Update(
  card: SM2Card,
  grade: SM2Grade,
  schedulePatch?: Partial<SM2ScheduleConfig>,
): SM2Card {
  const schedule = normalizeScheduleConfig(schedulePatch);
  const now = Date.now();
  const easeFactor = clamp(card.easeFactor + getEaseDelta(grade), EASE_MIN, EASE_MAX);
  let interval = Math.max(card.interval, MIN_INTERVAL_DAYS);
  let repetitions = card.repetitions;
  let nextReviewAt = now;

  if (grade === 0) {
    repetitions = 0;
    interval = schedule.grade0Minutes / 1440;
    nextReviewAt = now + schedule.grade0Minutes * MINUTE_MS;
  } else if (grade === 1) {
    repetitions = 0;
    interval = schedule.grade1Minutes / 1440;
    nextReviewAt = now + schedule.grade1Minutes * MINUTE_MS;
  } else if (grade === 2) {
    repetitions = 0;
    interval = schedule.grade2Days;
    nextReviewAt = now + schedule.grade2Days * DAY_MS;
  } else {
    repetitions += 1;
    const baseInterval = clamp(Math.max(interval, 1), MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS);

    if (grade === 3) {
      interval = baseInterval * schedule.grade3Multiplier;
    } else if (grade === 4) {
      interval = baseInterval * schedule.grade4Multiplier * easeFactor;
    } else {
      interval = baseInterval * schedule.grade5Multiplier * easeFactor;
    }

    interval = clamp(interval, MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS);
    const jitter = 1 - JITTER_RATIO + Math.random() * (JITTER_RATIO * 2);
    nextReviewAt = now + interval * jitter * DAY_MS;
  }

  let masteryLevel: SM2Card['masteryLevel'] = 0;
  if (repetitions === 0) masteryLevel = 0;
  else if (interval < 7) masteryLevel = 1;
  else if (interval < 21) masteryLevel = 2;
  else masteryLevel = 3;

  return { ...card, easeFactor, interval, repetitions, nextReviewAt, masteryLevel };
}

export function formatReviewEta(nextReviewAt: number, reference = Date.now()): string {
  const diff = nextReviewAt - reference;
  if (diff <= 0) return '现在';

  if (diff < HOUR_MS) {
    return `${Math.max(1, Math.ceil(diff / MINUTE_MS))} 分钟后`;
  }

  if (diff < DAY_MS) {
    return `${Math.ceil(diff / HOUR_MS)} 小时后`;
  }

  return `${Math.ceil(diff / DAY_MS)} 天后`;
}

export function getDueCards<T extends Pick<SM2Card, 'nextReviewAt'>>(cards: T[]): T[] {
  const now = Date.now();
  return cards
    .filter((c) => c.nextReviewAt <= now)
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
}

export function createSM2Card(wordId: number): SM2Card {
  return {
    wordId,
    easeFactor: 2.5,
    interval: 1,
    repetitions: 0,
    nextReviewAt: Date.now(),
    masteryLevel: 0,
  };
}
