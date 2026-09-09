import clsx from 'clsx';

// Shared cream/amber theme primitives for the Sample Production → Batch Tracker merged
// journey (SampleProduction.jsx, SampleLeadDetail.jsx, production/StageSteps.jsx). Pulled
// out into its own leaf module (no imports from any of those three) so none of them form an
// import cycle — StageSteps.jsx previously imported Card/PILL back from SampleProduction.jsx,
// which (via SampleProduction -> SampleLeadDetail -> StageSteps -> SampleProduction) left PILL
// in the temporal dead zone the moment StageSteps.jsx used it at module scope (PRIORITY_STYLE).

export const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Zilla+Slab:wght@500;600;700&display=swap');";
const bodyFont = { fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" };

export function Card({ children, className = '', ...rest }) {
  return <div className={clsx('bg-white rounded-md border border-[#e7e2d6] shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_28px_rgba(28,25,23,0.06)] p-4', className)} style={bodyFont} {...rest}>{children}</div>;
}

export const PILL = {
  success: 'bg-[#e2ece5] text-[#2f6b4f]',
  warning: 'bg-[#f3e6c8] text-[#a8781f]',
  danger: 'bg-[#f5e3e0] text-[#a13d34]',
  info: 'bg-[#f3e6c8] text-[#a8781f]',
  purple: 'bg-[#ece2ea] text-[#7c5a17]',
  gray: 'bg-[#e7e2d6] text-[#6b6155]',
};

export function StatCard({ emoji, iconTone, label, value, hint, valueTone = 'text-[#1c1917]', onClick }) {
  return (
    <Card
      className={clsx(
        'flex items-start justify-between gap-3 hover:-translate-y-0.5 hover:shadow-[0_10px_40px_rgba(28,25,23,0.12)] transition-transform',
        onClick && 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a8781f]'
      )}
      {...(onClick ? {
        role: 'button',
        tabIndex: 0,
        onClick,
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } },
      } : {})}
    >
      <div className="min-w-0">
        <p className="text-xs text-[#6b6155] font-medium mb-1.5">{label}</p>
        <p className={clsx('text-2xl font-bold tracking-tight', valueTone)} style={{ fontFamily: "'Zilla Slab', Georgia, serif" }}>{value}</p>
        {hint && <p className="text-[11px] text-[#a39c8c] mt-1">{hint}</p>}
      </div>
      <div className={clsx('w-11 h-11 rounded-md flex items-center justify-center text-lg flex-shrink-0', PILL[iconTone] || PILL.gray)}>{emoji}</div>
    </Card>
  );
}

export const SUB_STAGE_PILL = {
  Requested: PILL.gray,
  'In Lab': PILL.info,
  Sent: PILL.warning,
  Feedback: PILL.purple,
  Approved: PILL.success,
  Rejected: PILL.danger,
};
