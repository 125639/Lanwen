// src/chartConfig.ts
// 所有图表共用的颜色和尺寸，统一从这里引用，不得在组件里硬编码颜色

export const CHART_COLORS = {
  primary:   '#6366F1',
  success:   '#10B981',
  warning:   '#F59E0B',
  danger:    '#EF4444',
  muted:     '#94A3B8',

  // 掌握度环形图专用
  mastered:  '#10B981',
  familiar:  '#3B82F6',
  learning:  '#F59E0B',
  newWord:   '#94A3B8',
  untouched: '#E2E8F0',

  // 渐变区域填充（折线图 area）
  primaryAlpha20: 'rgba(99, 102, 241, 0.20)',
  primaryAlpha05: 'rgba(99, 102, 241, 0.05)',
  successAlpha20: 'rgba(16, 185, 129, 0.20)',
  successAlpha05: 'rgba(16, 185, 129, 0.05)',
};

export const CHART_STYLE = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize:   12,
  axisColor:  'var(--color-text-tertiary)',   // 轴线颜色
  gridColor:  'var(--color-border)',           // 网格线颜色
  tooltipBg:  'var(--color-surface)',
  tooltipBorder: 'var(--color-border)',
  animationDuration: 800,                     // ms，所有图表统一
  animationEasing:   'ease-out' as const,
};

// X 轴日期格式化
export function formatDateLabel(dateKey: string): string {
  const d = new Date(dateKey);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
