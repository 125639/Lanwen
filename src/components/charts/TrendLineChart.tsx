// src/components/charts/TrendLineChart.tsx
import {
  ResponsiveContainer, ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { CHART_COLORS, CHART_STYLE } from '../../chartConfig';

export interface TrendDataPoint {
  dateKey: string;  // "2025-01-15"，用于 X 轴
  label: string;    // "1/15"，格式化后展示
  learned: number;  // 当天新学单词数
  reviewed: number; // 当天复习单词数
}

interface Props {
  data: TrendDataPoint[];
  height?: number;
}

export function TrendLineChart({ data, height = 220 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        {/* 渐变定义 */}
        <defs>
          <linearGradient id="gradLearned" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={CHART_COLORS.primary} stopOpacity={0.25} />
            <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradReviewed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={CHART_COLORS.success} stopOpacity={0.25} />
            <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke={CHART_STYLE.gridColor}
          vertical={false}        // 只要水平网格线
        />

        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: CHART_STYLE.axisColor, fontFamily: CHART_STYLE.fontFamily }}
          tickLine={false}
          axisLine={{ stroke: CHART_STYLE.gridColor }}
          interval="preserveStartEnd"  // 只显示首尾和中间适量的刻度
        />

        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: CHART_STYLE.axisColor, fontFamily: CHART_STYLE.fontFamily }}
          tickLine={false}
          axisLine={false}
          width={36}
        />

        <Tooltip content={<TrendTooltip />} />

        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 12, fontFamily: CHART_STYLE.fontFamily }}
          formatter={(value) => value === 'learned' ? '新学' : '复习'}
        />

        {/* 面积（填充）*/}
        <Area
          type="monotone"
          dataKey="learned"
          stroke="none"
          fill="url(#gradLearned)"
          isAnimationActive
          animationDuration={CHART_STYLE.animationDuration}
          animationEasing={CHART_STYLE.animationEasing}
        />
        <Area
          type="monotone"
          dataKey="reviewed"
          stroke="none"
          fill="url(#gradReviewed)"
          isAnimationActive
          animationDuration={CHART_STYLE.animationDuration}
          animationEasing={CHART_STYLE.animationEasing}
        />

        {/* 折线（在面积上方）*/}
        <Line
          type="monotone"
          dataKey="learned"
          stroke={CHART_COLORS.primary}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0, fill: CHART_COLORS.primary }}
          isAnimationActive
          animationDuration={CHART_STYLE.animationDuration}
          animationEasing={CHART_STYLE.animationEasing}
        />
        <Line
          type="monotone"
          dataKey="reviewed"
          stroke={CHART_COLORS.success}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0, fill: CHART_COLORS.success }}
          isAnimationActive
          animationDuration={CHART_STYLE.animationDuration}
          animationEasing={CHART_STYLE.animationEasing}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// 自定义 Tooltip
interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    stroke: string;
    value: number;
  }>;
  label?: string;
}

function TrendTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <span className="chart-tooltip-dot" style={{ background: p.stroke }} />
          <span>{p.dataKey === 'learned' ? '新学' : '复习'}</span>
          <span className="chart-tooltip-value">{p.value} 个</span>
        </div>
      ))}
    </div>
  );
}
