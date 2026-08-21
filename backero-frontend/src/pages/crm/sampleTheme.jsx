import clsx from 'clsx';

// Shared cream/amber theme primitives for the Sample Production → Batch Tracker merged
// journey (SampleProduction.jsx, SampleLeadDetail.jsx, production/StageSteps.jsx). Pulled
// out into its own leaf module (no imports from any of those three) so none of them form an
// import cycle — StageSteps.jsx previously imported Card/PILL back from SampleProduction.jsx,
// which (via SampleProduction -> SampleLeadDetail -> StageSteps -> SampleProduction) left PILL
// in the temporal dead zone the moment StageSteps.jsx used it at module scope (PRIORITY_STYLE).

export const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:wght@500;600;700&display=swap');";
const bodyFont = { fontFamily: "'Inter', -apple-system, sans-serif" };

export function Card({ children, className = '', ...rest }) {
  return <div className={clsx('bg-white rounded-2xl border border-[#e2dac8] shadow-[0_1px_3px_rgba(46,36,27,0.05),0_4px_12px_rgba(46,36,27,0.08)] p-4', className)} style={bodyFont} {...rest}>{children}</div>;
}

export const PILL = {
  success: 'bg-[#dce9d4] text-[#3a5f3c]',
  warning: 'bg-[#f3e3c2] text-[#7a5a10]',
  danger: 'bg-[#f0d8d2] text-[#8c3a30]',
  info: 'bg-[#dde5ea] text-[#33526b]',
  purple: 'bg-[#e6dce9] text-[#5d4470]',
  gray: 'bg-[#e2dac8] text-[#5a4d3a]',
};

export function StatCard({ emoji, iconTone, label, value, hint, valueTone = 'text-[#2e241b]', onClick }) {
  return (
    <Card
      className={clsx(
        'flex items-start justify-between gap-3 hover:-translate-y-0.5 hover:shadow-[0_10px_40px_rgba(46,36,27,0.16)] transition-transform',
        onClick && 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f2b23e]'
      )}
      {...(onClick ? {
        role: 'button',
        tabIndex: 0,
        onClick,
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } },
      } : {})}
    >
      <div className="min-w-0">
        <p className="text-xs text-[#6d5f4c] font-medium mb-1.5">{label}</p>
        <p className={clsx('text-2xl font-bold tracking-tight', valueTone)}>{value}</p>
        {hint && <p className="text-[11px] text-[#968871] mt-1">{hint}</p>}
      </div>
      <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0', PILL[iconTone] || PILL.gray)}>{emoji}</div>
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
