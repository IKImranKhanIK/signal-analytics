import { useEffect, useState } from 'react'
import { runQuery, type QueryResult } from '../lib/db'

type State = {
  data: QueryResult | null
  error: string | null
  loading: boolean
}

/** Run a SQL query whenever the string changes. */
export function useQuery(sql: string): State {
  const [state, setState] = useState<State>({ data: null, error: null, loading: true })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    runQuery(sql)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((e) => !cancelled && setState({ data: null, error: String(e), loading: false }))
    return () => {
      cancelled = true
    }
  }, [sql])

  return state
}

/** Convenience: rows array (empty while loading). */
export function useRows<T = Record<string, unknown>>(sql: string): { rows: T[]; loading: boolean; error: string | null } {
  const { data, loading, error } = useQuery(sql)
  return { rows: (data?.rows ?? []) as T[], loading, error }
}
