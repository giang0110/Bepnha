import { COOKING_PROGRESS_STORAGE_KEY } from "@/app/pwa/household-device-data"

export { COOKING_PROGRESS_STORAGE_KEY } from "@/app/pwa/household-device-data"

export interface TimerProgressV1 {
  readonly startedAt: number | null
  readonly pausedWith: number | null
}

export interface CookingProgressV1 {
  readonly version: "cooking-progress-v1"
  readonly revisionId: string
  readonly dayIndex: number
  readonly stepKey: string
  readonly timers: Readonly<Record<string, TimerProgressV1>>
}

export interface CookingProgressStorage {
  readonly getItem: (key: string) => string | null
  readonly setItem: (key: string, value: string) => void
  readonly removeItem: (key: string) => void
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function isTimer(value: unknown): value is TimerProgressV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const timer = value as Record<string, unknown>
  return (
    (timer.startedAt === null || isNonNegativeFiniteNumber(timer.startedAt)) &&
    (timer.pausedWith === null || isNonNegativeFiniteNumber(timer.pausedWith))
  )
}

function isCookingProgress(value: unknown): value is CookingProgressV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const progress = value as Record<string, unknown>
  if (
    progress.version !== "cooking-progress-v1" ||
    typeof progress.revisionId !== "string" ||
    progress.revisionId.length === 0 ||
    !Number.isSafeInteger(progress.dayIndex) ||
    (progress.dayIndex as number) < 0 ||
    typeof progress.stepKey !== "string" ||
    typeof progress.timers !== "object" ||
    progress.timers === null ||
    Array.isArray(progress.timers)
  ) {
    return false
  }
  return Object.entries(progress.timers).every(([key, timer]) => key.length > 0 && isTimer(timer))
}

export function loadCookingProgress(
  storage: CookingProgressStorage,
  revisionId: string,
  dayIndex: number
): CookingProgressV1 | null {
  try {
    const encoded = storage.getItem(COOKING_PROGRESS_STORAGE_KEY)
    if (encoded === null) return null
    const parsed: unknown = JSON.parse(encoded)
    if (!isCookingProgress(parsed)) return null
    return parsed.revisionId === revisionId && parsed.dayIndex === dayIndex ? parsed : null
  } catch {
    return null
  }
}

export function saveCookingProgress(
  storage: CookingProgressStorage,
  progress: CookingProgressV1
): void {
  try {
    storage.setItem(COOKING_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Cooking must continue even when private browsing or storage quota blocks persistence.
  }
}

export function clearCookingProgress(
  storage: CookingProgressStorage,
  revisionId: string,
  dayIndex: number
): void {
  try {
    const current = loadCookingProgress(storage, revisionId, dayIndex)
    if (current !== null) storage.removeItem(COOKING_PROGRESS_STORAGE_KEY)
  } catch {
    // Completing a meal must never depend on device storage availability.
  }
}
