import { RECENT_PANTRY_FOODS_KEY } from "@/app/pwa/household-device-data"

export interface RecentPantryStorage {
  readonly getItem: (key: string) => string | null
  readonly setItem: (key: string, value: string) => void
}

interface RecentFood {
  readonly householdId: string
  readonly foodId: string
}

const MAX_RECENTS = 8

function browserStorage(): RecentPantryStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage
  } catch {
    return undefined
  }
}

function isIdentity(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128
}

function isRecentFood(value: unknown): value is RecentFood {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return (
    isIdentity(entry.householdId) && isIdentity(entry.foodId) && Object.keys(entry).length === 2
  )
}

function readRecents(storage: RecentPantryStorage | undefined): RecentFood[] {
  try {
    const encoded = storage?.getItem(RECENT_PANTRY_FOODS_KEY)
    if (encoded === undefined || encoded === null || encoded.length > 4096) return []
    const parsed: unknown = JSON.parse(encoded)
    if (!Array.isArray(parsed) || parsed.length > MAX_RECENTS || !parsed.every(isRecentFood)) {
      return []
    }
    return parsed.filter(
      (entry, index, entries) =>
        entries.findIndex(
          (other) => other.householdId === entry.householdId && other.foodId === entry.foodId
        ) === index
    )
  } catch {
    return []
  }
}

export function loadRecentPantryFoods(
  householdId: string,
  storage: RecentPantryStorage | undefined = browserStorage()
): string[] {
  return readRecents(storage)
    .filter((entry) => entry.householdId === householdId)
    .map((entry) => entry.foodId)
}

export function rememberRecentPantryFood(
  householdId: string,
  foodId: string,
  storage: RecentPantryStorage | undefined = browserStorage()
): void {
  if (!isIdentity(householdId) || !isIdentity(foodId)) return
  const recents = [
    { householdId, foodId },
    ...readRecents(storage).filter(
      (entry) => entry.householdId !== householdId || entry.foodId !== foodId
    )
  ].slice(0, MAX_RECENTS)
  try {
    storage?.setItem(RECENT_PANTRY_FOODS_KEY, JSON.stringify(recents))
  } catch {
    // This shortcut is optional; pantry mutations must succeed when device storage is unavailable.
  }
}
