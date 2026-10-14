// A platform that does not report a figure gives null: show "n/a", never a made-up 0%.
export const fmtPct = (v: number | null | undefined): string => (v == null ? 'n/a' : `${Number(v).toFixed(2)}%`)
