/** Data model for guided investigations ("case files"). */

/**
 * How a step validates the learner's work:
 * - rows:       run the step's solution SQL, project both results onto `columns`,
 *               and compare (order-insensitive by default, numeric rounding applied)
 * - value-range: the first row of the learner's result must have `column` within
 *               [min, max] — used where several defensible methods give slightly
 *               different numbers (z-scores, excess estimates)
 * - text:       free-text answer matched against accepted strings (case-insensitive);
 *               the learner still uses SQL to find it, then types it in
 */
export type Check =
  | {
      type: 'rows'
      columns: string[]
      precision?: number
      orderMatters?: boolean
      allowExtraRows?: boolean
    }
  | { type: 'value-range'; column: string; min: number; max: number }
  | { type: 'text'; answers: string[]; placeholder?: string }

export type Step = {
  id: string
  title: string
  /** Narrative setup — why an analyst would ask this next. */
  brief: string
  /** The concrete task, including required output columns. */
  task: string
  /** Starter SQL placed in the editor (may be a scaffold with gaps). */
  starter?: string
  hints: string[]
  /** Reference solution. Also produces the expected result for `rows` checks. */
  solution: string
  check: Check
  /** Shown after the step is passed (or the solution revealed). */
  debrief: string
  /** SQL concept this step teaches, shown as a chip. */
  teaches: string
}

export type CaseFile = {
  id: string
  title: string
  tagline: string
  difficulty: 'beginner' | 'intermediate'
  minutes: number
  intro: string
  steps: Step[]
  /** The model findings memo, revealed on completion. */
  memo: { title: string; body: string[] }
}
