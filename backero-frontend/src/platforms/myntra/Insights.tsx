import Card, { PageHeader } from '../../components/Card.tsx'

export default function MyntraInsightsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Myntra — Insights" subtitle="AI-driven recommendations" />
      <Card className="text-center py-8">
        <h3 className="text-sm font-semibold text-ink mb-2">Insights & Recommendations</h3>
        <p className="text-stone text-xs">
          Get AI-powered insights about style quotient optimization, trending categories, and seller performance recommendations.
        </p>
      </Card>
    </div>
  )
}
