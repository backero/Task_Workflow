const colors: Record<string, string> = {
  green: 'bg-leaf',
  amber: 'bg-amber',
  red: 'bg-brick',
}

export default function StatusDot({ status }: { status: 'green' | 'amber' | 'red' }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status] ?? colors.green}`} />
}
