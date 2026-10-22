import Card, { PageHeader } from '../../components/Card.tsx'

export default function MyntraAlertsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Myntra — Alerts" subtitle="Policy violations and account health warnings" />
      <Card className="text-center py-8">
        <h3 className="text-sm font-semibold text-ink mb-2">System Alerts</h3>
        <p className="text-stone text-xs">
          Track style quotient changes, policy compliance, return rate alerts, and account health warnings.
        </p>
      </Card>
    </div>
  )
}
