// src/components/charts/VocabGrowthChart.tsx
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { CHART_COLORS, CHART_STYLE } from '../../chartConfig';

interface VocabGrowthDataPoint {
  date: string;
  label: string;
  total: number;
  added: number;
}

interface Props {
  data: VocabGrowthDataPoint[];
  height?: number;
}

export function VocabGrowthChart({ data, height = 200 }: Props) {
  const maxVal = Math.max(...data.map((d) => d.total), 1);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradVocab" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={CHART_COLORS.warning} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS.warning} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke={CHART_STYLE.gridColor} vertical={false} />

        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: CHART_STYLE.axisColor }}
          tickLine={false}
          axisLine={{ stroke: CHART_STYLE.gridColor }}
          interval="preserveStartEnd"
        />

        <YAxis
          domain={[0, Math.ceil(maxVal * 1.1)]}
          allowDecimals={false}
          tick={{ fontSize: 11, fill: CHART_STYLE.axisColor }}
          tickLine={false}
          axisLine={false}
          width={36}
        />

        <Tooltip content={<VocabTooltip />} />

        <Area
          type="monotone"
          dataKey="total"
          stroke={CHART_COLORS.warning}
          strokeWidth={2.5}
          fill="url(#gradVocab)"
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0, fill: CHART_COLORS.warning }}
          isAnimationActive
          animationDuration={CHART_STYLE.animationDuration}
          animationEasing={CHART_STYLE.animationEasing}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface VocabTooltipPayload {
  payload: {
    label: string;
    total: number;
    added: number;
  };
}

interface VocabTooltipProps {
  active?: boolean;
  payload?: VocabTooltipPayload[];
}

function VocabTooltip({ active, payload }: VocabTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">{d.label}</div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-dot" style={{ background: CHART_COLORS.warning }} />
        <span>累计词汇</span>
        <span className="chart-tooltip-value">{d.total} 个</span>
      </div>
      {d.added > 0 && (
        <div className="chart-tooltip-row subtle">
          <span />
          <span>今日新增</span>
          <span className="chart-tooltip-value">+{d.added}</span>
        </div>
      )}
    </div>
  );
}
