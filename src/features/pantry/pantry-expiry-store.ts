import { classifyFoodFreshness } from "@/domain/pantry/food-freshness"

export type ExpiryStatus = "fresh" | "expiring_soon" | "expired"

export interface ExpiryEvaluation {
  readonly expiryDate: string
  readonly daysRemaining: number
  readonly status: ExpiryStatus
  readonly labelVi: string
}

const STORAGE_PREFIX = "bepnha:pantry:expiry:v1:"

function storageKey(householdId: string): string {
  return `${STORAGE_PREFIX}${householdId}`
}

export function evaluateExpiry(
  expiryDate: string,
  referenceDateIso?: string
): ExpiryEvaluation | null {
  const trimmed = expiryDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null

  const target = new Date(trimmed)
  if (Number.isNaN(target.getTime())) return null

  const now = referenceDateIso ? new Date(referenceDateIso) : new Date()
  const todayDateStr = now.toISOString().slice(0, 10)
  const today = new Date(todayDateStr)

  const diffMs = target.getTime() - today.getTime()
  const daysRemaining = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (daysRemaining < 0) {
    const overdue = Math.abs(daysRemaining)
    return {
      expiryDate: trimmed,
      daysRemaining,
      status: "expired",
      labelVi: overdue === 1 ? "Quá hạn 1 ngày" : `Quá hạn ${overdue} ngày`
    }
  }

  if (daysRemaining === 0) {
    return {
      expiryDate: trimmed,
      daysRemaining,
      status: "expiring_soon",
      labelVi: "Hết hạn hôm nay"
    }
  }

  if (daysRemaining <= 3) {
    return {
      expiryDate: trimmed,
      daysRemaining,
      status: "expiring_soon",
      labelVi: `Còn ${daysRemaining} ngày`
    }
  }

  return {
    expiryDate: trimmed,
    daysRemaining,
    status: "fresh",
    labelVi: `Còn ${daysRemaining} ngày`
  }
}

export function calculatePantryItemUrgency(
  foodNameVi: string,
  expiryDate?: string,
  referenceDateIso?: string
): { priority: number; daysRemaining?: number } {
  if (expiryDate) {
    const evaluation = evaluateExpiry(expiryDate, referenceDateIso)
    if (evaluation !== null) {
      if (evaluation.status === "expired") {
        return { priority: 10, daysRemaining: evaluation.daysRemaining }
      }
      if (evaluation.status === "expiring_soon") {
        return {
          priority: 9 - Math.max(0, Math.min(3, evaluation.daysRemaining)),
          daysRemaining: evaluation.daysRemaining
        }
      }
      // Fresh with explicit expiry date
      if (evaluation.daysRemaining <= 7) {
        return { priority: 2, daysRemaining: evaluation.daysRemaining }
      }
      return { priority: 1, daysRemaining: evaluation.daysRemaining }
    }
  }

  const freshness = classifyFoodFreshness(foodNameVi)
  return { priority: freshness.urgencyPriority }
}

export function isPantryItemUrgent(
  foodNameVi: string,
  expiryDate?: string,
  referenceDateIso?: string
): boolean {
  if (expiryDate) {
    const evaluation = evaluateExpiry(expiryDate, referenceDateIso)
    if (evaluation !== null) {
      return evaluation.status === "expired" || evaluation.status === "expiring_soon"
    }
  }
  return classifyFoodFreshness(foodNameVi).isUrgent
}

export function sortPantryItemsByUrgency<T>(
  items: readonly T[],
  getFoodName: (item: T) => string,
  getExpiryDate: (item: T) => string | undefined,
  referenceDateIso?: string
): T[] {
  return [...items].sort((left, right) => {
    const leftName = getFoodName(left)
    const rightName = getFoodName(right)
    const leftUrgency = calculatePantryItemUrgency(leftName, getExpiryDate(left), referenceDateIso)
    const rightUrgency = calculatePantryItemUrgency(
      rightName,
      getExpiryDate(right),
      referenceDateIso
    )

    const priorityDiff = rightUrgency.priority - leftUrgency.priority
    if (priorityDiff !== 0) return priorityDiff

    if (
      leftUrgency.daysRemaining !== undefined &&
      rightUrgency.daysRemaining !== undefined &&
      leftUrgency.daysRemaining !== rightUrgency.daysRemaining
    ) {
      return leftUrgency.daysRemaining - rightUrgency.daysRemaining
    }

    return leftName.localeCompare(rightName, "vi", { sensitivity: "base" })
  })
}

export function loadPantryExpiries(
  storage: Storage | undefined,
  householdId: string
): Record<string, string> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(storageKey(householdId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
    const result: Record<string, string> = {}
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        result[key] = val
      }
    }
    return result
  } catch {
    return {}
  }
}

export function savePantryExpiry(
  storage: Storage | undefined,
  householdId: string,
  pantryItemId: string,
  expiryDate: string
): Record<string, string> {
  const current = storage ? loadPantryExpiries(storage, householdId) : {}
  const updated = { ...current }
  const trimmed = expiryDate.trim()
  if (!trimmed) {
    delete updated[pantryItemId]
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    updated[pantryItemId] = trimmed
  }
  try {
    storage?.setItem(storageKey(householdId), JSON.stringify(updated))
  } catch {
    // Gracefully handle storage errors (e.g. quota or security restrictions)
  }
  return updated
}
