import Card, { PageHeader } from '../../components/Card.tsx'

export default function JioMartAnalyticsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="JioMart — Analytics" subtitle="Sales and operational performance" />
      <Card className="text-center py-8">
        <h3 className="text-sm font-semibold text-ink mb-2">Analytics Dashboard</h3>
        <p className="text-stone text-xs">
          Track sales, dispatch SLA compliance, order fulfillment, and customer satisfaction metrics.
        </p>
      </Card>
    </div>
  )
}
