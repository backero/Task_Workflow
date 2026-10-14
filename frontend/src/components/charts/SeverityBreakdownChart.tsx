import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { STATUS_COLORS } from '../../theme/colors'

interface SeverityBreakdownChartProps {
  data?: Array<{ label: string; critical: number; warning: number; info: number }>
  critical?: number
  warning?: number
  info?: number
  height?: number
}

export default function SeverityBreakdownChart({ data: externalData, critical = 0, warning = 0, info = 0, height = 200 }: SeverityBreakdownChartProps) {
  const data = externalData || [{ label: 'Alerts', critical, warning, info }]

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} />
        <YAxis dataKey="label" type="category" tick={{ fontSize: 12, fill: '#6b7280' }} width={90} />
        <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px' }} />
        <Bar dataKey="critical" stackId="a" fill={STATUS_COLORS.critical} isAnimationActive={false} />
        <Bar dataKey="warning" stackId="a" fill={STATUS_COLORS.warning} isAnimationActive={false} />
        <Bar dataKey="info" stackId="a" fill={STATUS_COLORS.info} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
