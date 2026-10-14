import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface Series {
  key: string
  label: string
  color: string
}

interface TrendLineChartProps {
  data: any[]
  series: Series[]
  yFormat?: (value: number) => string
  height?: number
}

export default function TrendLineChart({ data, series, yFormat, height = 300 }: TrendLineChartProps) {
  if (!data || data.length === 0) {
    return <div className="text-gray-400 text-sm p-4">No data available</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6b7280' }} />
        <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
        <Tooltip
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px' }}
          formatter={(value: any) => yFormat ? yFormat(value) : value}
        />
        {series.length > 1 && <Legend />}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            name={s.label}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
