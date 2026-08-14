import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { SqlBlock } from '../components/SqlBlock'
import { runQuery, type QueryResult } from '../lib/db'
import { compareRange, compareRows, compareText, type Verdict } from '../lib/learn/compare'
import { CASE_FILES } from '../lib/learn/march-spike'
import { getProgress, resetCase, updateProgress, type StepProgress } from '../lib/learn/progress'
import type { Step } from '../lib/learn/types'

function ResultTable({ result }: { result: QueryResult }) {
  const MAX = 12
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-line">
      <table className="w-full text-[12px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-muted">
            {result.columns.map((c) => (
              <th key={c} className="border-b border-line px-2.5 py-1.5 font-semibold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, MAX).map((row, i) => (
            <tr key={i} className="border-b border-line text-ink-2 last:border-b-0">
              {result.columns.map((c) => (
                <td key={c} className="tnum whitespace-nowrap px-2.5 py-1">{String(row[c] ?? 'NULL')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length > MAX && (
        <p className="px-2.5 py-1.5 text-[11.5px] text-muted">
          … {result.rows.length - MAX} more rows
        </p>
      )}
    </div>
  )
}

function StepCard({
  step, index, caseId, unlocked, onPassed,
}: {
  step: Step
  index: number
  caseId: string
  unlocked: boolean
  onPassed: () => void
}) {
  const [progress, setProgress] = useState<StepProgress>(() => getProgress(caseId, step.id))
  const [sql, setSql] = useState(step.starter ?? '')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [textAnswer, setTextAnswer] = useState('')
  const [running, setRunning] = useState(false)

  const done = progress.passed || progress.revealed
  const patch = useCallback(
    (p: Partial<StepProgress>) => setProgress(updateProgress(caseId, step.id, p)),
    [caseId, step.id],
  )

  const runAndCheck = async () => {
    setRunning(true)
    setError(null)
    setVerdict(null)
    try {
      const learner = await runQuery(sql)
      setResult(learner)
      let v: Verdict
      if (step.check.type === 'rows') {
        const expected = await runQuery(step.solution)
        v = compareRows(learner, expected, step.check)
      } else if (step.check.type === 'value-range') {
        v = compareRange(learner, step.check)
      } else {
        v = compareText(textAnswer, step.check)
      }
      setVerdict(v)
      const attempts = progress.attempts + 1
      patch({ attempts, passed: progress.passed || v.pass })
      if (v.pass && !progress.passed) onPassed()
    } catch (e) {
      setError(String(e))
      patch({ attempts: progress.attempts + 1 })
    } finally {
      setRunning(false)
    }
  }

  const canReveal = progress.attempts >= 2 || progress.hintsUsed >= step.hints.length

  if (!unlocked)
    return (
      <section className="rounded-xl border border-line bg-surface p-4 opacity-60">
        <p className="text-[13.5px] font-medium text-muted">
          {index + 1}. {step.title} — locked (finish the previous step)
        </p>
      </section>
    )

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">
            Step {index + 1} of 6 · {step.teaches}
          </p>
          <h3 className="mt-0.5 text-[16px] font-semibold text-ink">
            {step.title} {done && <span className="text-[var(--good)]">✓</span>}
          </h3>
        </div>
      </header>

      <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-ink-2">{step.brief}</p>
      <p className="mt-3 max-w-prose rounded-lg bg-page px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
        <span className="font-semibold">Task: </span>
        {step.task}
      </p>

      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runAndCheck()
        }}
        spellCheck={false}
        rows={Math.min(Math.max(sql.split('\n').length + 1, 5), 16)}
        className="mt-3 w-full resize-y rounded-lg border border-line bg-page p-3 font-mono text-[12.5px] leading-relaxed text-ink outline-none focus:border-[var(--s1)]"
      />

      {step.check.type === 'text' && (
        <input
          value={textAnswer}
          onChange={(e) => setTextAnswer(e.target.value)}
          placeholder={step.check.placeholder ?? 'Your answer'}
          className="mt-2 w-full rounded-lg border border-line bg-page px-3 py-2 text-[13.5px] text-ink outline-none focus:border-[var(--s1)]"
        />
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          onClick={runAndCheck}
          disabled={running}
          className="rounded-lg bg-[var(--s1)] px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {running ? 'Running…' : step.check.type === 'text' ? 'Run / check answer' : 'Run & check'}
        </button>
        {progress.hintsUsed < step.hints.length && !done && (
          <button
            onClick={() => patch({ hintsUsed: progress.hintsUsed + 1 })}
            className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:text-ink"
          >
            Hint ({progress.hintsUsed}/{step.hints.length} used)
          </button>
        )}
        {!done && canReveal && (
          <button
            onClick={() => {
              patch({ revealed: true })
              setSql(step.solution)
              onPassed()
            }}
            className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:text-ink"
          >
            Reveal solution
          </button>
        )}
      </div>

      {step.hints.slice(0, progress.hintsUsed).map((h, i) => (
        <p key={i} className="mt-2 rounded-lg border border-line bg-page px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">Hint {i + 1}: </span>
          <span className="font-mono text-[11.5px]">{h}</span>
        </p>
      ))}

      {error && (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--critical)]/40 p-3 text-[12px] text-ink-2">{error}</pre>
      )}

      {verdict && !error && (
        <p
          className="mt-3 rounded-lg px-3.5 py-2.5 text-[13px] font-medium"
          style={{
            background: `color-mix(in srgb, ${verdict.pass ? 'var(--good)' : 'var(--serious)'} 12%, transparent)`,
            color: verdict.pass ? 'var(--delta-good-text)' : 'var(--serious)',
          }}
        >
          {verdict.message}
        </p>
      )}

      {result && !error && <div className="mt-3"><ResultTable result={result} /></div>}

      {done && (
        <div className="mt-4 border-t border-line pt-3.5">
          {progress.revealed && !progress.passed && (
            <div className="mb-3">
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted">Reference solution</p>
              <SqlBlock sql={step.solution} />
            </div>
          )}
          <p className="max-w-prose text-[13.5px] leading-relaxed text-ink-2">
            <span className="font-semibold text-ink">What an analyst takes from this: </span>
            {step.debrief}
          </p>
        </div>
      )}
    </section>
  )
}

export function CaseFilePage() {
  const { caseId } = useParams()
  const caseFile = CASE_FILES.find((c) => c.id === caseId) ?? CASE_FILES[0]
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((n) => n + 1), [])

  const doneCount = useMemo(() => {
    return caseFile.steps.filter((s) => {
      const p = getProgress(caseFile.id, s.id)
      return p.passed || p.revealed
    }).length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseFile, version])

  useEffect(() => {
    document.title = `${caseFile.title} · Signal`
    return () => {
      document.title = 'Signal · Trust & Experience Analytics'
    }
  }, [caseFile])

  const complete = doneCount === caseFile.steps.length

  return (
    <div className="space-y-4">
      <PageHeader title={caseFile.title} lede={caseFile.intro} />

      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 rounded-full bg-[var(--grid)]">
          <div
            className="h-2 rounded-full bg-[var(--s1)] transition-all"
            style={{ width: `${(100 * doneCount) / caseFile.steps.length}%` }}
          />
        </div>
        <p className="tnum text-[12.5px] text-muted">{doneCount}/{caseFile.steps.length}</p>
        <button
          onClick={() => {
            resetCase(caseFile.id)
            window.location.reload()
          }}
          className="rounded-md border border-line px-2 py-1 text-[12px] text-ink-2 hover:text-ink"
        >
          Reset
        </button>
      </div>

      {caseFile.steps.map((step, i) => (
        <StepCard
          key={step.id}
          step={step}
          index={i}
          caseId={caseFile.id}
          unlocked={i <= doneCount}
          onPassed={bump}
        />
      ))}

      {complete && (
        <section className="rounded-xl border-2 border-[var(--good)]/50 bg-surface p-5 sm:p-6">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--delta-good-text)]">
            Case closed — the finding, written up
          </p>
          <h3 className="mt-1 text-[17px] font-semibold text-ink">{caseFile.memo.title}</h3>
          {caseFile.memo.body.map((p, i) => (
            <p key={i} className="mt-3 max-w-prose text-[13.5px] leading-relaxed text-ink-2">{p}</p>
          ))}
          <p className="mt-4 max-w-prose border-t border-line pt-3 text-[13px] leading-relaxed text-muted">
            This memo is the actual deliverable of the investigation — evidence, impact, actions,
            priorities. Compare it with what you found at each step, then see the same incident from
            the monitoring side in <Link to="/anomalies" className="font-medium text-[var(--s1)] hover:underline">Anomaly watch</Link>.
          </p>
        </section>
      )}
    </div>
  )
}
