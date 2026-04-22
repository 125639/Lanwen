interface PageControlProps {
  current: number;
  total: number;
  currentWord?: string;
  onPrev: () => void;
  onNext: () => void;
}

export function PageControl({ current, total, currentWord, onPrev, onNext }: PageControlProps) {
  const currentDisplay = total === 0 ? 0 : current + 1;

  return (
    <section className="page-control">
      <button
        type="button"
        className="tap page-btn"
        onClick={onPrev}
        disabled={current <= 0}
        aria-label="上一张卡片"
        title="上一张卡片"
      >
        ←
      </button>
      <div className="page-info">
        <p className="page-info-text">{currentDisplay} / {total}</p>
        <small className="page-info-word">{currentWord || '当前没有单词'}</small>
      </div>
      <button
        type="button"
        className="tap page-btn"
        onClick={onNext}
        disabled={current >= total - 1}
        aria-label="下一张卡片"
        title="下一张卡片"
      >
        →
      </button>
    </section>
  );
}
