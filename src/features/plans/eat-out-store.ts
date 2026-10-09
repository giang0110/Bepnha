export interface EatOutDayRecord {
  readonly dayIndex: number
  readonly reasonNote?: string | undefined
}

interface StoredEatOutPayload {
  readonly version: "eat-out-v1"
  readonly revisionId: string
  readonly days: readonly EatOutDayRecord[]
}

const STORAGE_PREFIX = "bepnha:eat-out:v1:"

function makeStorageKey(revisionId: string): string {
  return `${STORAGE_PREFIX}${revisionId}`
}

export function loadEatOutDays(
  storage: Storage | undefined,
  revisionId: string
): readonly EatOutDayRecord[] {
  if (!storage || !revisionId) return []
  try {
    const raw = storage.getItem(makeStorageKey(revisionId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== "eat-out-v1" ||
      !("days" in parsed) ||
      !Array.isArray(parsed.days)
    ) {
      return []
    }
    const days: readonly unknown[] = parsed.days
    return days.filter(
      (d): d is EatOutDayRecord =>
        typeof d === "object" &&
        d !== null &&
        "dayIndex" in d &&
        typeof d.dayIndex === "number" &&
        d.dayIndex >= 0 &&
        d.dayIndex <= 6
    )
  } catch {
    return []
  }
}

export function saveEatOutDays(
  storage: Storage | undefined,
  revisionId: string,
  days: readonly EatOutDayRecord[]
): void {
  if (!storage || !revisionId) return
  try {
    const payload: StoredEatOutPayload = {
      version: "eat-out-v1",
      revisionId,
      days
    }
    storage.setItem(makeStorageKey(revisionId), JSON.stringify(payload))
  } catch {
    // Gracefully ignore storage quota errors
  }
}

export function toggleEatOutDay(
  storage: Storage | undefined,
  revisionId: string,
  dayIndex: number,
  reasonNote?: string
): readonly EatOutDayRecord[] {
  const current = loadEatOutDays(storage, revisionId)
  const existingIndex = current.findIndex((d) => d.dayIndex === dayIndex)

  let next: readonly EatOutDayRecord[]
  if (existingIndex >= 0) {
    next = current.filter((d) => d.dayIndex !== dayIndex)
  } else {
    const newRecord: EatOutDayRecord = {
      dayIndex,
      reasonNote: reasonNote?.trim() ? reasonNote.trim() : undefined
    }
    next = [...current, newRecord].sort((a, b) => a.dayIndex - b.dayIndex)
  }

  saveEatOutDays(storage, revisionId, next)
  return next
}

export function setEatOutDayReason(
  storage: Storage | undefined,
  revisionId: string,
  dayIndex: number,
  reasonNote: string
): readonly EatOutDayRecord[] {
  const current = loadEatOutDays(storage, revisionId)
  const next = current.map((d) =>
    d.dayIndex === dayIndex ? { ...d, reasonNote: reasonNote.trim() } : d
  )
  saveEatOutDays(storage, revisionId, next)
  return next
}

export function clearEatOutDays(storage: Storage | undefined, revisionId: string): void {
  if (!storage || !revisionId) return
  try {
    storage.removeItem(makeStorageKey(revisionId))
  } catch {
    // Ignore storage deletion errors
  }
}
