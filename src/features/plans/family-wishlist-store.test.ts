import { describe, expect, test, beforeEach } from "vitest"
import {
  loadFamilyWishlist,
  saveFamilyWishlist,
  addWishToStore,
  removeWishFromStore,
  clearFamilyWishlist
} from "./family-wishlist-store"

describe("family-wishlist-store", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  test("loads empty array when nothing is stored or invalid JSON", () => {
    expect(loadFamilyWishlist(window.localStorage, "hh-1")).toEqual([])

    window.localStorage.setItem("bepnha:family-wishlist:v1:hh-1", "invalid json")
    expect(loadFamilyWishlist(window.localStorage, "hh-1")).toEqual([])
  })

  test("saves and loads family wishes", () => {
    const wishes = [
      {
        mealOptionId: "opt-1",
        mealOptionNameVi: "Canh chua",
        requestedBy: "Bố",
        voteCount: 1,
        createdAtIso: "2026-09-30T10:00:00Z"
      }
    ]

    saveFamilyWishlist(window.localStorage, "hh-1", wishes)
    const loaded = loadFamilyWishlist(window.localStorage, "hh-1")
    expect(loaded).toEqual(wishes)
  })

  test("adds a wish and updates vote count in store", () => {
    addWishToStore(window.localStorage, "hh-1", {
      mealOptionId: "opt-1",
      mealOptionNameVi: "Canh chua",
      requestedBy: "Bố"
    })

    let current = loadFamilyWishlist(window.localStorage, "hh-1")
    expect(current).toHaveLength(1)
    expect(current[0]?.voteCount).toBe(1)

    // Add again from Mẹ -> vote count becomes 2
    addWishToStore(window.localStorage, "hh-1", {
      mealOptionId: "opt-1",
      mealOptionNameVi: "Canh chua",
      requestedBy: "Mẹ"
    })

    current = loadFamilyWishlist(window.localStorage, "hh-1")
    expect(current).toHaveLength(1)
    expect(current[0]?.voteCount).toBe(2)
    expect(current[0]?.requestedBy).toContain("Bố, Mẹ")
  })

  test("removes wish from store", () => {
    addWishToStore(window.localStorage, "hh-1", {
      mealOptionId: "opt-1",
      mealOptionNameVi: "Canh chua",
      requestedBy: "Bố"
    })
    addWishToStore(window.localStorage, "hh-1", {
      mealOptionId: "opt-2",
      mealOptionNameVi: "Sườn rán",
      requestedBy: "Bé Bắp"
    })

    removeWishFromStore(window.localStorage, "hh-1", "opt-1")
    const current = loadFamilyWishlist(window.localStorage, "hh-1")
    expect(current).toHaveLength(1)
    expect(current[0]?.mealOptionId).toBe("opt-2")
  })

  test("clears wishlist for household", () => {
    addWishToStore(window.localStorage, "hh-1", {
      mealOptionId: "opt-1",
      mealOptionNameVi: "Canh chua",
      requestedBy: "Bố"
    })

    clearFamilyWishlist(window.localStorage, "hh-1")
    expect(loadFamilyWishlist(window.localStorage, "hh-1")).toEqual([])
  })
})
