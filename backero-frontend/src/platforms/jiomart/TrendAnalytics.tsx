import Card, { PageHeader } from '../../components/Card.tsx'

export default function JioMartTrendAnalyticsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="JioMart — Trends" subtitle="Category and customer trends" />
      <Card className="text-center py-8">
        <h3 className="text-sm font-semibold text-ink mb-2">Market Trends</h3>
        <p className="text-stone text-xs">
          Monitor trending categories, seasonal demands, and customer preferences on JioMart.
        </p>
      </Card>
    </div>
  )
}
