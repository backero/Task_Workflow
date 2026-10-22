import Card, { PageHeader } from '../../components/Card.tsx'

export default function JioMartInsightsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="JioMart — Insights" subtitle="Performance recommendations" />
      <Card className="text-center py-8">
        <h3 className="text-sm font-semibold text-ink mb-2">Insights & Optimization</h3>
        <p className="text-stone text-xs">
          Get recommendations on dispatch SLA improvement, inventory optimization, and customer satisfaction.
        </p>
      </Card>
    </div>
  )
}
