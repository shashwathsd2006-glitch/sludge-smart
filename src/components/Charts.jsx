import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { shortDate } from '../lib/calc.js';

const axisStyle = { fontSize: 10, fill: '#9B9B9B', letterSpacing: '0.08em' };

function ChartTooltip({ active, payload, label, unit = '', labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{labelFormatter ? labelFormatter(label) : label}</div>
      {payload.map((entry) => (
        <div className="chart-tooltip-row" key={entry.dataKey || entry.name}>
          <span>{entry.name}</span>
          <strong>{Number(entry.value).toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}</strong>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({
  data, xKey = 'date', series, unit = '', height = 250,
  domain, reference, yLabel,
}) {
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#E6E6E6" strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(value) => shortDate(value)}
            tick={axisStyle}
            tickLine={false}
            axisLine={{ stroke: '#111111' }}
            minTickGap={24}
          />
          <YAxis
            tick={axisStyle}
            tickLine={false}
            axisLine={{ stroke: '#111111' }}
            width={48}
            domain={domain || ['auto', 'auto']}
            label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', style: axisStyle } : undefined}
          />
          <Tooltip
            content={<ChartTooltip unit={unit} labelFormatter={(value) => shortDate(value)} />}
            cursor={{ stroke: '#9B9B9B', strokeDasharray: '3 3' }}
          />
          {reference && (
            <ReferenceLine y={reference.value} stroke="#9B9B9B" strokeDasharray="4 4"
              label={{ value: reference.label, position: 'right', style: axisStyle }} />
          )}
          {series.map((item) => (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.name || item.key}
              stroke={item.color || '#E30613'}
              strokeWidth={item.width || 2}
              dot={{ r: 2, fill: item.color || '#E30613', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: item.color || '#E30613', stroke: '#FFFFFF', strokeWidth: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarComparisonChart({ data, xKey = 'name', bars, height = 300, unit = '' }) {
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#E6E6E6" horizontal={false} />
          <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={{ stroke: '#111111' }} />
          <YAxis type="category" dataKey={xKey} width={168} tick={{ ...axisStyle, fill: '#111111' }} tickLine={false} axisLine={{ stroke: '#111111' }} />
          <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: '#F2F2F2' }} />
          <Legend wrapperStyle={{ ...axisStyle, paddingTop: 8 }} iconType="square" />
          {bars.map((bar) => (
            <Bar key={bar.key} dataKey={bar.key} name={bar.name || bar.key} fill={bar.color || '#111111'} barSize={bar.size || 12} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({ items }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span key={item.label}>
          <i style={{ background: item.color }} />{item.label}
        </span>
      ))}
    </div>
  );
}
