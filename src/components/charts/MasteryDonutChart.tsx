// src/components/charts/MasteryDonutChart.tsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_COLORS, CHART_STYLE } from '../../chartConfig';

export interface MasteryData {
  mastered: number;
  familiar: number;
  learning: number;
  newWords: number;
  untouched: number;
}

interface Props {
  data: MasteryData;
  size?: number;
}

const SEGMENTS = [
  { key: 'mastered',  label: '已掌握', color: CHART_COLORS.mastered  },
  { key: 'familiar',  label: '熟悉中', color: CHART_COLORS.familiar  },
  { key: 'learning',  label: '学习中', color: CHART_COLORS.learning  },
  { key: 'newWords',  label: '待开始', color: CHART_COLORS.newWord   },
  { key: 'untouched', label: '未接触', color: CHART_COLORS.untouched },
];

export function MasteryDonutChart({ data, size = 180 }: Props) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const masteredPct = total > 0 ? Math.round((data.mastered / total) * 100) : 0;

  const pieData = SEGMENTS.map((s) => ({
    name: s.label,
    value: data[s.key as keyof MasteryData],
    color: s.color,
  })).filter((d) => d.value > 0);

  return (
    <div className="mastery-donut-wrap" style={{ width: size, position: 'relative' }}>
      {/* 中央文字（绝对定位叠加在图表上） */}
      <div className="mastery-donut-center" style={{ ['--donut-size' as string]: `${size}px` }}>
        <span className="mastery-donut-pct">{masteredPct}%</span>
        <span className="mastery-donut-label">已掌握</span>
      </div>

      <ResponsiveContainer width={size} height={size}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.32}   // 环形宽度约 18% 直径
            outerRadius={size * 0.50}
            startAngle={90}
            endAngle={-270}             // 顺时针
            dataKey="value"
            strokeWidth={0}
            paddingAngle={2}
            isAnimationActive
            animationBegin={0}
            animationDuration={CHART_STYLE.animationDuration}
            animationEasing={CHART_STYLE.animationEasing}
          >
            {pieData.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip total={total} />} />
        </PieChart>
      </ResponsiveContainer>

      {/* 图例（图表右侧） */}
      <div className="mastery-legend">
        {SEGMENTS.map((s) => {
          const val = data[s.key as keyof MasteryData];
          if (val === 0) return null;
          return (
            <div key={s.key} className="mastery-legend-row">
              <span className="mastery-legend-dot" style={{ background: s.color }} />
              <span className="mastery-legend-name">{s.label}</span>
              <span className="mastery-legend-val">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DonutTooltipPayload {
  name: string;
  value: number;
  payload: {
    color: string;
  };
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: DonutTooltipPayload[];
  total?: number;
}

function DonutTooltip({ active, payload, total = 0 }: DonutTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-dot" style={{ background: d.payload.color }} />
        <span>{d.name}</span>
        <span className="chart-tooltip-value">{d.value} 个 ({pct}%)</span>
      </div>
    </div>
  );
}
