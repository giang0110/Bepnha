import { useSyncExternalStore } from "react"
import {
  addOrVoteWishItem,
  removeWishItem,
  type FamilyMealWish,
  type AddWishItemInput
} from "@/domain/planner/family-meal-wishlist"

export type { FamilyMealWish }

const STORAGE_PREFIX = "bepnha:family-wishlist:v1:"

function storageKey(householdId: string): string {
  return `${STORAGE_PREFIX}${householdId}`
}

export function loadFamilyWishlist(storage: Storage, householdId: string): FamilyMealWish[] {
  try {
    const raw = storage.getItem(storageKey(householdId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is FamilyMealWish =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as FamilyMealWish).mealOptionId === "string" &&
        typeof (item as FamilyMealWish).mealOptionNameVi === "string" &&
        typeof (item as FamilyMealWish).voteCount === "number"
    )
  } catch {
    return []
  }
}

export function saveFamilyWishlist(
  storage: Storage,
  householdId: string,
  wishes: readonly FamilyMealWish[]
): void {
  try {
    storage.setItem(storageKey(householdId), JSON.stringify(wishes))
    // Dispatch custom event for reactive tab/component syncing
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(
        new CustomEvent("bepnha:family-wishlist-changed", {
          detail: { householdId }
        })
      )
    }
  } catch {
    // Quota exceeded or access denied
  }
}

export function addWishToStore(
  storage: Storage,
  householdId: string,
  input: Omit<AddWishItemInput, "nowIso">
): FamilyMealWish[] {
  const current = loadFamilyWishlist(storage, householdId)
  const updated = addOrVoteWishItem(current, {
    ...input,
    nowIso: new Date().toISOString()
  })
  saveFamilyWishlist(storage, householdId, updated)
  return updated
}

export function removeWishFromStore(
  storage: Storage,
  householdId: string,
  mealOptionId: string
): FamilyMealWish[] {
  const current = loadFamilyWishlist(storage, householdId)
  const updated = removeWishItem(current, mealOptionId)
  saveFamilyWishlist(storage, householdId, updated)
  return updated
}

export function clearFamilyWishlist(storage: Storage, householdId: string): void {
  try {
    storage.removeItem(storageKey(householdId))
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(
        new CustomEvent("bepnha:family-wishlist-changed", {
          detail: { householdId }
        })
      )
    }
  } catch {
    // Storage access denied
  }
}

const EMPTY_WISHES: readonly FamilyMealWish[] = []
let cachedKey = ""
let cachedValue: readonly FamilyMealWish[] = EMPTY_WISHES

export function useFamilyWishlist(householdId: string | null): readonly FamilyMealWish[] {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {}
      window.addEventListener("bepnha:family-wishlist-changed", onStoreChange)
      window.addEventListener("storage", onStoreChange)
      return () => {
        window.removeEventListener("bepnha:family-wishlist-changed", onStoreChange)
        window.removeEventListener("storage", onStoreChange)
      }
    },
    () => {
      if (!householdId || typeof window === "undefined") return EMPTY_WISHES
      const raw = window.localStorage.getItem(storageKey(householdId)) ?? ""
      const key = `${householdId}:${raw}`
      if (key !== cachedKey) {
        cachedKey = key
        cachedValue = loadFamilyWishlist(window.localStorage, householdId)
      }
      return cachedValue
    },
    () => EMPTY_WISHES
  )
}
