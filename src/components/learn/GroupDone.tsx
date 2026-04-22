// src/components/learn/GroupDone.tsx


interface Props {
  stats: {
    total: number;
    known: number;
    unknown: number;
    wrong: number;
    passed: number;
  };
  onViewList: () => void;
  onNextGroup: () => void;
  onFinish: () => void;
}

export function GroupDone({ stats, onViewList, onNextGroup, onFinish }: Props) {
  const allPassed = stats.passed >= stats.total;

  const emoji = allPassed ? '🎉' : '💪';
  const title = allPassed ? '太棒了！本组全部掌握！' : '继续加油！';
  const summaryText =
    stats.wrong > 0 || stats.unknown > 0
      ? '本组里仍有容易卡壳的词，建议接着做复习或错词强化。'
      : '这一组状态不错，可以顺势推进下一组新词。';

  return (
    <div className="group-done">
      <div className="group-done-emoji">{emoji}</div>
      <h2 className="group-done-title">{title}</h2>
      <p className="group-done-summary">{summaryText}</p>

      {/* 统计卡片 */}
      <div className="group-done-stats">
        <div className="stats-grid">
          <div className="stat-item known">
            <span className="stat-value">{stats.known}</span>
            <span className="stat-label">认识</span>
          </div>
          <div className="stat-item unknown">
            <span className="stat-value">{stats.unknown}</span>
            <span className="stat-label">不认识</span>
          </div>
          <div className="stat-item wrong">
            <span className="stat-value">{stats.wrong}</span>
            <span className="stat-label">记错了</span>
          </div>
          <div className="stat-item passed">
            <span className="stat-value">{stats.passed}</span>
            <span className="stat-label">测试通过</span>
          </div>
        </div>
      </div>

      {/* 按钮组 */}
      <div className="group-done-actions">
        <button className="action-btn ghost" onClick={onViewList}>
          查看本组单词列表
        </button>
        <button className="action-btn primary" onClick={onNextGroup}>
          继续下一组 →
        </button>
        <button className="action-btn text" onClick={onFinish}>
          今天到此为止
        </button>
      </div>
    </div>
  );
}
