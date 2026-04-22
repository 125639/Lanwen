import { useEffect } from 'react';
import { ACHIEVEMENTS } from '../achievements';

interface AchievementUnlockModalProps {
  achievementId: string | null;
  onClose: () => void;
}

export function AchievementUnlockModal({ achievementId, onClose }: AchievementUnlockModalProps) {
  const achievement = ACHIEVEMENTS.find((item) => item.id === achievementId) ?? null;

  useEffect(() => {
    if (!achievement) {
      return;
    }

    const timer = window.setTimeout(() => {
      onClose();
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [achievement, onClose]);

  if (!achievement) {
    return null;
  }

  return (
    <div className="achievement-unlock-overlay" onClick={onClose}>
      <div className="achievement-unlock-modal" onClick={(e) => e.stopPropagation()}>
        <div className={`unlock-badge ${achievement.tier}`}>
          <span className="unlock-glow" />
          <span className="unlock-icon">{achievement.icon}</span>
        </div>
        <p className="unlock-kicker">成就解锁！</p>
        <h3>{achievement.title}</h3>
        <p>{achievement.description}</p>
        <button type="button" className="tap primary-btn" onClick={onClose}>
          太棒了！
        </button>
      </div>
    </div>
  );
}
