/**
 * Device-local storage for tracking completed meal prep and defrost tasks.
 * Keyed strictly by plan revision and day index to preserve deterministic isolation.
 */

const STORAGE_PREFIX = "bepnha:prep:completed:v1:"

function storageKey(revisionId: string, dayIndex: number): string {
  return `${STORAGE_PREFIX}${revisionId}:${dayIndex}`
}

export function loadCompletedPrepTasks(
  storage: Storage | undefined,
  revisionId: string,
  dayIndex: number
): ReadonlySet<string> {
  if (!storage) return new Set()
  try {
    const raw = storage.getItem(storageKey(revisionId, dayIndex))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((item): item is string => typeof item === "string"))
    }
    return new Set()
  } catch {
    return new Set()
  }
}

export function setPrepTaskCompleted(
  storage: Storage | undefined,
  revisionId: string,
  dayIndex: number,
  taskId: string,
  completed: boolean
): ReadonlySet<string> {
  if (!storage) return new Set()
  try {
    const current = new Set(loadCompletedPrepTasks(storage, revisionId, dayIndex))
    if (completed) {
      current.add(taskId)
    } else {
      current.delete(taskId)
    }
    storage.setItem(storageKey(revisionId, dayIndex), JSON.stringify([...current]))
    return current
  } catch {
    return new Set()
  }
}

export function clearPrepTasksForRevision(storage: Storage | undefined, revisionId: string): void {
  if (!storage) return
  try {
    const prefix = `${STORAGE_PREFIX}${revisionId}:`
    const keysToRemove: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      storage.removeItem(key)
    }
  } catch {
    // Best effort cleanup
  }
}
