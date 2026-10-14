import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { STATUS_COLORS } from '../../theme/colors'

interface PriorityItem {
  id?: string | number
  label: string
  score: number
  priority?: 'high' | 'medium' | 'low'
}

interface PriorityBarChartProps {
  data?: PriorityItem[]
  recommendations?: any[]
  height?: number
}

export default function PriorityBarChart({ data: externalData, recommendations = [], height = 300 }: PriorityBarChartProps) {
  let data = externalData
  if (!data && recommendations && recommendations.length > 0) {
    data = recommendations
      .map((r) => ({
        id: r.id,
        label: r.title,
        score: r.priority_score || 0,
        priority: r.priority,
      }))
  }

  if (!data || data.length === 0) {
    return <div className="text-gray-400 text-sm p-4">No recommendations available</div>
  }

  const sorted = [...data]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 10)
    .map((r, i) => ({
      ...r,
      index: i,
      calculatedPriority: r.priority || (r.score > 70 ? 'high' : r.score > 40 ? 'medium' : 'low'),
    }))

  const getColor = (priority: string) => {
    if (priority === 'high' || priority === 'critical') return STATUS_COLORS.critical
    if (priority === 'medium' || priority === 'warning') return STATUS_COLORS.warning
    return STATUS_COLORS.info
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 200, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} domain={[0, 100]} />
        <YAxis dataKey="label" type="category" tick={{ fontSize: 11, fill: '#6b7280' }} width={190} />
        <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px' }} />
        <Bar dataKey="score" fill="#8884d8" isAnimationActive={false} radius={[0, 4, 4, 0]}>
          {sorted.map((item, i) => (
            <Cell key={i} fill={getColor(item.calculatedPriority)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
