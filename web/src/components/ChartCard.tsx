import { useState, type ReactNode } from 'react'
import { SqlBlock } from './SqlBlock'

type Props = {
  title: string
  subtitle?: string
  sql: string
  children: ReactNode
  /** The one-sentence conclusion a reader should leave with. Shown emphasized. */
  takeaway?: ReactNode
  footnote?: string
}

/**
 * Every chart lives in one of these. The "View SQL" toggle reveals the exact
 * query that produced the chart — the same string that ran against DuckDB.
 */
export function ChartCard({ title, subtitle, sql, children, takeaway, footnote }: Props) {
  const [showSql, setShowSql] = useState(false)
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
        </div>
        <button
          onClick={() => setShowSql((v) => !v)}
          className="shrink-0 rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:text-ink"
          aria-expanded={showSql}
        >
          {showSql ? 'Hide SQL' : 'View SQL'}
        </button>
      </header>
      {showSql && (
        <div className="mb-4">
          <SqlBlock sql={sql} />
          <p className="mt-1.5 text-[12px] text-muted">
            This exact query powers the chart — paste it into the SQL Workbench to verify.
          </p>
        </div>
      )}
      {children}
      {takeaway && (
        <p className="mt-3 rounded-lg border-l-[3px] border-[var(--s1)] bg-[color-mix(in_srgb,var(--s1)_7%,transparent)] px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
          <span className="font-bold text-[var(--s1)]">Takeaway&ensp;</span>
          {takeaway}
        </p>
      )}
      {footnote && <p className="mt-3 text-[12px] leading-relaxed text-muted">{footnote}</p>}
    </section>
  )
}
