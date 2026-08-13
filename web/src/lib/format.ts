export const fmtInt = (n: number): string => new Intl.NumberFormat('en-US').format(Math.round(n))

export const fmtUsd = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export const fmtPct = (n: number, digits = 1): string => `${n.toFixed(digits)}%`

export const fmtCompact = (n: number): string =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

export const fmtDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`
}

export const titleCase = (s: string): string =>
  s.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
