import type { ReactNode } from 'react'

export type Finding = {
  title: string
  evidence: ReactNode
  impact: ReactNode
  action: ReactNode
  priority: 'P0' | 'P1' | 'P2'
}

const PRIORITY_STYLE: Record<Finding['priority'], string> = {
  P0: 'bg-[color-mix(in_srgb,var(--critical)_14%,transparent)] text-[var(--critical)]',
  P1: 'bg-[color-mix(in_srgb,var(--serious)_16%,transparent)] text-[var(--serious)]',
  P2: 'bg-[color-mix(in_srgb,var(--s1)_14%,transparent)] text-[var(--s1)]',
}

/** "Findings & Recommendations" — written like an internal memo, on purpose. */
export function Memo({ title, intro, findings }: { title: string; intro: string; findings: Finding[] }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">
        Findings &amp; recommendations
      </p>
      <h3 className="mt-1 text-[17px] font-semibold text-ink">{title}</h3>
      <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-ink-2">{intro}</p>
      <ol className="mt-5 space-y-5">
        {findings.map((f, i) => (
          <li key={i} className="border-t border-line pt-4">
            <div className="flex items-baseline gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${PRIORITY_STYLE[f.priority]}`}>
                {f.priority}
              </span>
              <h4 className="text-[14.5px] font-semibold text-ink">{f.title}</h4>
            </div>
            <dl className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed">
              <div>
                <dt className="inline font-medium text-ink">Evidence: </dt>
                <dd className="inline text-ink-2">{f.evidence}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-ink">Impact: </dt>
                <dd className="inline text-ink-2">{f.impact}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-ink">Recommended action: </dt>
                <dd className="inline text-ink-2">{f.action}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
    </section>
  )
}
