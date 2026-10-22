import Card, { PageHeader } from '../../components/Card.tsx'
import SectionHeader from '../../components/SectionHeader.tsx'

export default function MyntraAnalyticsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Myntra — Analytics"
        subtitle="Detailed performance analysis and trends"
      />
      <Card className="text-center py-8">
        <h3 className="text-sm font-semibold text-ink mb-2">Analytics Dashboard</h3>
        <p className="text-stone text-xs">
          Connect your Myntra seller account to view detailed analytics including style quotient,
          listing performance, ad metrics, and customer reviews.
        </p>
      </Card>
    </div>
  )
}
