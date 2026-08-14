import { Link } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { CASE_FILES } from '../lib/learn'
import { caseCompletion } from '../lib/learn/progress'

export function Learn() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Investigations"
        kicker="Learn · guided case files"
        accent="var(--s3)"
        lede="Guided case files that teach the analyst workflow by doing it: form a question, write the SQL, read the evidence, quantify the impact, write the finding. Your queries run against the same live dataset as every chart in this app, and each step is checked against ground truth."
      />

      {CASE_FILES.map((c) => {
        const done = caseCompletion(c.id, c.steps.map((s) => s.id))
        return (
          <Link
            key={c.id}
            to={`/learn/${c.id}`}
            className="block rounded-xl border border-line bg-surface p-5 transition-colors hover:border-[var(--s1)]"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[16px] font-semibold text-ink">{c.title}</h3>
              <p className="tnum shrink-0 text-[12.5px] text-muted">
                {done > 0 ? `${done}/${c.steps.length} steps` : `~${c.minutes} min`} · {c.difficulty}
              </p>
            </div>
            <p className="mt-1.5 max-w-prose text-[13.5px] leading-relaxed text-ink-2">{c.tagline}</p>
            <p className="mt-2.5 text-[12.5px] text-ink-2">
              Teaches: {c.steps.map((s) => s.teaches).join(' · ')}
            </p>
          </Link>
        )
      })}

      <section className="rounded-xl border border-dashed border-line p-5 text-[13.5px] leading-relaxed text-muted">
        <p className="font-medium text-ink-2">More case files planned</p>
        <p className="mt-1 max-w-prose">
          “Who's burning the promos?” (cohort thinking and abuse economics) is next. The framework
          and answer-checking are already built — each new case is pure content. In the meantime,
          the <Link to="/sql" className="font-medium text-[var(--s1)] hover:underline">SQL workbench</Link>{' '}
          has six worked examples of increasing sophistication to explore freely.
        </p>
      </section>
    </div>
  )
}
