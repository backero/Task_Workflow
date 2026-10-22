import Card, { PageHeader } from '../../components/Card.tsx'

export default function JioMartAlertsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="JioMart — Alerts" subtitle="SLA violations and account alerts" />
      <Card className="text-center py-8">
        <h3 className="text-sm font-semibold text-ink mb-2">System Alerts</h3>
        <p className="text-stone text-xs">
          Track dispatch SLA breaches, order issues, policy violations, and account health warnings.
        </p>
      </Card>
    </div>
  )
}
