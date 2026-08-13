import type { ReactNode } from 'react'
import { fmtInt } from '../lib/format'

/** Shared Recharts bits: themed tooltip + palette helpers. */

export const SERIES = [
  'var(--s1)',
  'var(--s2)',
  'var(--s3)',
  'var(--s4)',
  'var(--s5)',
  'var(--s6)',
  'var(--s7)',
  'var(--s8)',
]

/** Fixed archetype → slot mapping (color follows the entity, never rank). */
export const ARCHETYPE_COLOR: Record<string, string> = {
  card_testing: 'var(--s1)',
  refund_abuse: 'var(--s2)',
  giftcard_laundering: 'var(--s3)',
  account_takeover: 'var(--s4)',
  promo_abuse: 'var(--s5)',
  friendly_fraud: 'var(--s7)',
  none: 'var(--muted)',
}

export const ARCHETYPE_LABEL: Record<string, string> = {
  card_testing: 'Card testing',
  refund_abuse: 'Refund abuse',
  giftcard_laundering: 'Gift-card laundering',
  account_takeover: 'Account takeover',
  promo_abuse: 'Promo abuse',
  friendly_fraud: 'Friendly fraud',
  none: 'Legitimate',
}

type TooltipRow = { name: string; value: ReactNode; color?: string }

export function TooltipShell({ title, rows }: { title: ReactNode; rows: TooltipRow[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg">
      <p className="font-semibold text-ink">{title}</p>
      {rows.map((r, i) => (
        <p key={i} className="mt-0.5 flex items-center gap-1.5 text-ink-2">
          {r.color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />}
          <span>{r.name}:</span>
          <span className="tnum font-medium text-ink">{r.value}</span>
        </p>
      ))}
    </div>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function defaultTooltip(formatter?: (key: string, value: number) => ReactNode) {
  return ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <TooltipShell
        title={label}
        rows={payload.map((p: any) => ({
          name: p.name,
          value: formatter ? formatter(p.dataKey, p.value) : fmtInt(p.value),
          color: p.color ?? p.fill,
        }))}
      />
    )
  }
}

export const AXIS_PROPS = {
  stroke: 'var(--axis)',
  tickLine: false as const,
  axisLine: { stroke: 'var(--axis)' },
}
