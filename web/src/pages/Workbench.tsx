import { useCallback, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { runQuery, type QueryResult } from '../lib/db'
import { fmtInt } from '../lib/format'
import { SCHEMA_DOC, WORKBENCH_EXAMPLES } from '../lib/queries'

const DEFAULT_SQL = WORKBENCH_EXAMPLES[0].sql
const MAX_DISPLAY_ROWS = 500

export function Workbench() {
  const [sql, setSql] = useState(DEFAULT_SQL)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState<number | null>(null)

  const run = useCallback(async (query: string) => {
    setRunning(true)
    setError(null)
    const t0 = performance.now()
    try {
      const res = await runQuery(query)
      setResult(res)
      setElapsed(performance.now() - t0)
    } catch (e) {
      setError(String(e))
      setResult(null)
    } finally {
      setRunning(false)
    }
  }, [])

  return (
    <div className="space-y-4">
      <PageHeader
        title="SQL workbench"
        kicker="Workbench · open access"
        accent="var(--s7)"
        lede="A live DuckDB instance with the full dataset — the same one every chart queries. Run anything; nothing leaves your browser. Cmd/Ctrl-Enter executes."
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_290px]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-xl border border-line bg-surface p-4">
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(sql)
              }}
              spellCheck={false}
              rows={Math.min(Math.max(sql.split('\n').length + 1, 6), 20)}
              className="w-full resize-y rounded-lg border border-line bg-page p-3 font-mono text-[12.5px] leading-relaxed text-ink outline-none focus:border-[var(--s1)]"
            />
            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={() => run(sql)}
                disabled={running}
                className="rounded-lg bg-[var(--s1)] px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {running ? 'Running…' : 'Run query'}
              </button>
              {result && elapsed !== null && (
                <p className="tnum text-[12px] text-muted">
                  {fmtInt(result.rows.length)} rows · {elapsed.toFixed(0)} ms
                </p>
              )}
            </div>
          </section>

          {error && (
            <div className="rounded-xl border border-[var(--critical)]/40 bg-surface p-4">
              <p className="text-[13px] font-semibold text-[var(--critical)]">Query error</p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[12px] text-ink-2">{error}</pre>
            </div>
          )}

          {result && !error && (
            <section className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="text-left text-muted">
                      {result.columns.map((c) => (
                        <th key={c} className="border-b border-line px-3 py-2 font-semibold">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, MAX_DISPLAY_ROWS).map((row, i) => (
                      <tr key={i} className="border-b border-line text-ink-2 last:border-b-0">
                        {result.columns.map((c) => (
                          <td key={c} className="tnum whitespace-nowrap px-3 py-1.5">
                            {String(row[c] ?? 'NULL')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.rows.length > MAX_DISPLAY_ROWS && (
                <p className="border-t border-line px-3 py-2 text-[12px] text-muted">
                  Showing first {MAX_DISPLAY_ROWS} of {fmtInt(result.rows.length)} rows.
                </p>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-line bg-surface p-4">
            <h3 className="text-[13px] font-semibold text-ink">Example queries</h3>
            <ul className="mt-2 space-y-1">
              {WORKBENCH_EXAMPLES.map((ex) => (
                <li key={ex.title}>
                  <button
                    onClick={() => {
                      setSql(ex.sql)
                      run(ex.sql)
                    }}
                    className="w-full rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-page hover:text-ink"
                    title={ex.description}
                  >
                    {ex.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-surface p-4">
            <h3 className="text-[13px] font-semibold text-ink">Schema</h3>
            {SCHEMA_DOC.map((t) => (
              <details key={t.table} className="mt-2" open={t.table === 'orders'}>
                <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-2">
                  {t.table} <span className="font-normal text-muted">({t.rows} rows)</span>
                </summary>
                <dl className="mt-1.5 space-y-1">
                  {t.columns.map(([name, desc]) => (
                    <div key={name} className="text-[11.5px] leading-snug">
                      <dt className="font-mono font-medium text-ink-2">{name}</dt>
                      <dd className="text-muted">{desc}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </section>
        </aside>
      </div>
    </div>
  )
}
