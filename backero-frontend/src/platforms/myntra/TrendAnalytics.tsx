import Card, { PageHeader } from '../../components/Card.tsx'

export default function MyintraTrendAnalyticsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Myntra — Trends" subtitle="Fashion trends & performance over time" />
      <Card className="text-center py-8">
        <h3 className="text-sm font-semibold text-ink mb-2">Trend Analysis</h3>
        <p className="text-stone text-xs">
          Track trending categories, colors, sizes, and styles on Myntra to align your inventory with market demand.
        </p>
      </Card>
    </div>
  )
}
