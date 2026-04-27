interface TopNavProps {
  title: string;
  streakDays?: number;
  onOpenStats?: () => void;
  onOpenSettings: () => void;
}

export function TopNav({ title, streakDays = 0, onOpenStats, onOpenSettings }: TopNavProps) {
  return (
    <header className="top-nav">
      <h1 className="top-nav-title">{title}</h1>
      <div className="top-nav-actions">
        {streakDays > 0 ? (
          <div className="streak-badge" aria-label={`已连续学习 ${streakDays} 天`} title={`已连续学习 ${streakDays} 天`}>
            <span className="fire">🔥</span>
            <span>{streakDays}</span>
          </div>
        ) : null}
        {onOpenStats ? (
          <button type="button" className="top-nav-btn ripple-btn" onClick={onOpenStats} aria-label="打开统计" title="打开统计">
            📊
          </button>
        ) : null}
        <button type="button" className="top-nav-btn ripple-btn" onClick={onOpenSettings} aria-label="打开设置" title="打开设置">
          ⚙️
        </button>
      </div>
    </header>
  );
}
