import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export default function SectionHeader({ title, to }: { title: string; to: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <Link to={to} className="flex items-center gap-1 text-xs font-medium text-clay hover:text-ember">
        View full <ArrowRight size={13} />
      </Link>
    </div>
  )
}
