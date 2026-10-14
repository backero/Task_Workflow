import type { ReactNode } from 'react'

export default function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  // Tailwind's generated CSS order doesn't follow this string's order, so a
  // hardcoded default bg can silently beat a caller's own bg-* class in the
  // cascade (seen live: bg-orange-500 callers rendered as invisible white-on-
  // white). Only fall back to bg-white when the caller hasn't set one.
  const hasBg = /(^|\s)bg-/.test(className)
  return (
    <div className={`rounded-2xl border border-gray-200 p-4 ${hasBg ? '' : 'bg-white'} ${className}`}>
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="mt-1.5 h-5 w-1.5 shrink-0 rounded-full bg-orange-500" />
      <div>
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
      </div>
    </div>
  )
}
