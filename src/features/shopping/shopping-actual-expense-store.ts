export interface StoredActualExpense {
  readonly actualCostVnd: number
  readonly recordedAtIso: string
  readonly note?: string
}

const STORAGE_PREFIX = "bepnha:shopping:actual-expense:v1:"

function storageKey(revisionId: string): string {
  return `${STORAGE_PREFIX}${revisionId}`
}

/**
 * Loads stored actual shopping expense for a specific plan revision from local storage.
 */
export function loadActualExpense(
  storage: Storage | undefined,
  revisionId: string
): StoredActualExpense | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(storageKey(revisionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown> | null
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.actualCostVnd === "number" &&
      Number.isFinite(parsed.actualCostVnd) &&
      parsed.actualCostVnd >= 0 &&
      typeof parsed.recordedAtIso === "string"
    ) {
      return {
        actualCostVnd: parsed.actualCostVnd,
        recordedAtIso: parsed.recordedAtIso,
        ...(typeof parsed.note === "string" && parsed.note.trim().length > 0
          ? { note: parsed.note.trim() }
          : {})
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Persists actual shopping expense for a specific plan revision to device local storage.
 */
export function saveActualExpense(
  storage: Storage | undefined,
  revisionId: string,
  actualCostVnd: number,
  note?: string
): StoredActualExpense | null {
  if (!storage || !Number.isFinite(actualCostVnd) || actualCostVnd < 0) return null
  try {
    const entry: StoredActualExpense = {
      actualCostVnd: Math.round(actualCostVnd),
      recordedAtIso: new Date().toISOString(),
      ...(note && note.trim().length > 0 ? { note: note.trim() } : {})
    }
    storage.setItem(storageKey(revisionId), JSON.stringify(entry))
    return entry
  } catch {
    return null
  }
}

/**
 * Clears stored actual shopping expense for a specific plan revision.
 */
export function clearActualExpense(storage: Storage | undefined, revisionId: string): void {
  if (!storage) return
  try {
    storage.removeItem(storageKey(revisionId))
  } catch {
    // Best-effort
  }
}
