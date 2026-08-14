/** Per-step learner progress, persisted in localStorage — no accounts, no server. */

export type StepProgress = {
  passed: boolean
  attempts: number
  hintsUsed: number
  revealed: boolean
}

type Store = Record<string, Record<string, StepProgress>>

const KEY = 'signal-investigations-v1'

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store
  } catch {
    return {}
  }
}

export function getProgress(caseId: string, stepId: string): StepProgress {
  return load()[caseId]?.[stepId] ?? { passed: false, attempts: 0, hintsUsed: 0, revealed: false }
}

export function updateProgress(
  caseId: string,
  stepId: string,
  patch: Partial<StepProgress>,
): StepProgress {
  const store = load()
  const next = { ...getProgress(caseId, stepId), ...patch }
  store[caseId] = { ...store[caseId], [stepId]: next }
  localStorage.setItem(KEY, JSON.stringify(store))
  return next
}

export function caseCompletion(caseId: string, stepIds: string[]): number {
  const store = load()
  return stepIds.filter((s) => store[caseId]?.[s]?.passed || store[caseId]?.[s]?.revealed).length
}

export function resetCase(caseId: string): void {
  const store = load()
  delete store[caseId]
  localStorage.setItem(KEY, JSON.stringify(store))
}
