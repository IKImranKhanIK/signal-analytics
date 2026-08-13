import { useEffect, useState } from 'react'
import { getDb } from '../lib/db'

/**
 * Gate that initializes DuckDB-WASM before rendering the app.
 * The app never shows a blank screen: this renders immediately with
 * progress messages while the WASM bundle + parquet files load.
 */
export function DbGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [step, setStep] = useState('Starting')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDb(setStep)
      .then(() => setReady(true))
      .catch((e) => setError(String(e)))
  }, [])

  if (error)
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-xl border border-line bg-surface p-6 text-center">
          <p className="text-[15px] font-semibold text-ink">Failed to initialize the database</p>
          <p className="mt-2 break-words text-[13px] text-ink-2">{error}</p>
          <p className="mt-3 text-[12.5px] text-muted">
            DuckDB-WASM needs WebAssembly enabled. Try a current Chrome, Firefox, or Safari.
          </p>
        </div>
      </div>
    )

  if (!ready)
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-5 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-[var(--s1)]" />
          <p className="text-[15px] font-semibold text-ink">Loading Signal</p>
          <p className="mt-1.5 text-[13px] text-ink-2">{step}…</p>
          <p className="mt-4 max-w-xs text-[12px] leading-relaxed text-muted">
            Spinning up an in-browser DuckDB instance and loading 25,000 orders +
            8,000 support contacts. Everything after this runs locally.
          </p>
        </div>
      </div>
    )

  return <>{children}</>
}
