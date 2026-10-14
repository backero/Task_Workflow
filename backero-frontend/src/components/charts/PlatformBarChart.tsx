import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { PLATFORM_COLORS } from '../../theme/colors'

interface PlatformBarChartData {
  platformId: string
  label: string
  value: number
}

interface PlatformBarChartProps {
  data: PlatformBarChartData[]
  valueFormat?: (v: number) => string
  colorMap?: Record<string, string>
  height?: number
}

export default function PlatformBarChart({ data, valueFormat, colorMap, height = 300 }: PlatformBarChartProps) {
  if (!data || data.length === 0) {
    return <div className="text-gray-400 text-sm p-4">No data available</div>
  }

  const chartData = data.map(d => ({ ...d, displayValue: valueFormat ? valueFormat(d.value) : d.value }))

  const getBarColor = (platformId: string) => {
    if (colorMap && colorMap[platformId]) return colorMap[platformId]
    return PLATFORM_COLORS[platformId as keyof typeof PLATFORM_COLORS] || '#8884d8'
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} angle={-45} textAnchor="end" height={80} />
        <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
        <Tooltip
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px' }}
          formatter={(value: any) => valueFormat ? valueFormat(value) : value}
        />
        <Bar dataKey="value" fill="#8884d8" isAnimationActive={false} radius={[4, 4, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getBarColor(entry.platformId)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
