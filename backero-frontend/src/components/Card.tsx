import type { ReactNode } from 'react'

export default function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-sand bg-white p-4 shadow-card transition-shadow hover:shadow-lift ${className}`}>
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <span className="mt-2 h-6 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-clay to-ember" />
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-stone">{subtitle}</p>}
      </div>
    </div>
  )
}
