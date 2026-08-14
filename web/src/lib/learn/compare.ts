import type { QueryResult } from '../db'
import type { Check } from './types'

export type Verdict = { pass: boolean; message: string }

/** Normalize a cell for comparison: round numbers, trim strings, date-prefix ISO-ish strings. */
function norm(value: unknown, precision: number): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') {
    const f = 10 ** precision
    return String(Math.round(value * f) / f)
  }
  const s = String(value).trim()
  // '2026-03-09 00:00:00' and '2026-03-09' should compare equal on date columns.
  if (/^\d{4}-\d{2}-\d{2}[ T]00:00:00/.test(s)) return s.slice(0, 10)
  return s
}

function findColumn(result: QueryResult, name: string): string | null {
  return result.columns.find((c) => c.toLowerCase() === name.toLowerCase()) ?? null
}

function project(result: QueryResult, columns: string[], precision: number): string[] {
  const actual = columns.map((c) => findColumn(result, c)!)
  return result.rows.map((r) => actual.map((c) => norm(r[c], precision)).join(' | '))
}

/**
 * Compare the learner's result against the expected result (produced by the
 * reference solution) on the check's columns only — extra columns are fine,
 * so learners can SELECT more than asked while exploring.
 */
export function compareRows(
  learner: QueryResult,
  expected: QueryResult,
  check: Extract<Check, { type: 'rows' }>,
): Verdict {
  const precision = check.precision ?? 2

  const missing = check.columns.filter((c) => !findColumn(learner, c))
  if (missing.length)
    return {
      pass: false,
      message: `Your result is missing the column${missing.length > 1 ? 's' : ''} ${missing
        .map((m) => `“${m}”`)
        .join(', ')} — alias your output columns to match the task.`,
    }

  const want = project(expected, check.columns, precision)
  const got = project(learner, check.columns, precision)

  if (!check.allowExtraRows && got.length !== want.length)
    return {
      pass: false,
      message: `Expected ${want.length} row${want.length === 1 ? '' : 's'}, got ${got.length}. Check your filters${
        got.length > want.length ? ' — something extra is slipping through' : ''
      }.`,
    }

  const gotSet = check.orderMatters ? got : [...got].sort()
  const wantSet = check.orderMatters ? want : [...want].sort()
  const wantAvailable = new Set(check.allowExtraRows ? got : [])

  for (let i = 0; i < wantSet.length; i++) {
    const ok = check.allowExtraRows ? wantAvailable.has(wantSet[i]) : gotSet[i] === wantSet[i]
    if (!ok)
      return {
        pass: false,
        message: `Close, but at least one row doesn't match. Expected to find (${check.columns.join(', ')}) = (${wantSet[i]}).`,
      }
  }
  return { pass: true, message: 'Correct — your result matches the reference query.' }
}

export function compareRange(
  learner: QueryResult,
  check: Extract<Check, { type: 'value-range' }>,
): Verdict {
  const col = findColumn(learner, check.column)
  if (!col)
    return { pass: false, message: `Your result needs a column named “${check.column}”.` }
  if (!learner.rows.length) return { pass: false, message: 'Your query returned no rows.' }
  const v = Number(learner.rows[0][col])
  if (Number.isNaN(v))
    return { pass: false, message: `“${check.column}” in your first row isn't a number.` }
  if (v < check.min || v > check.max)
    return {
      pass: false,
      message: `Your value (${v}) is outside the plausible range. Reread the task — the window definition matters.`,
    }
  return { pass: true, message: `Correct — ${v} is in the accepted range.` }
}

export function compareText(answer: string, check: Extract<Check, { type: 'text' }>): Verdict {
  const a = answer.trim().toLowerCase()
  if (!a) return { pass: false, message: 'Type your answer above, then check it.' }
  return check.answers.some((x) => x.toLowerCase() === a)
    ? { pass: true, message: 'Correct.' }
    : { pass: false, message: 'Not it — keep digging. The contact summaries are free text; read a few.' }
}
