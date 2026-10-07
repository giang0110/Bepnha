import { describe, expect, it, beforeEach } from "vitest"
import {
  evaluateExpiry,
  loadPantryExpiries,
  savePantryExpiry,
  calculatePantryItemUrgency,
  isPantryItemUrgent,
  sortPantryItemsByUrgency
} from "./pantry-expiry-store"

describe("pantry-expiry-store", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("evaluates expired items with overdue days count", () => {
    const evalResult = evaluateExpiry("2026-10-01", "2026-10-05T00:00:00Z")
    expect(evalResult).not.toBeNull()
    expect(evalResult?.status).toBe("expired")
    expect(evalResult?.daysRemaining).toBe(-4)
    expect(evalResult?.labelVi).toBe("Quá hạn 4 ngày")
  })

  it("evaluates items expiring today", () => {
    const evalResult = evaluateExpiry("2026-10-05", "2026-10-05T00:00:00Z")
    expect(evalResult).not.toBeNull()
    expect(evalResult?.status).toBe("expiring_soon")
    expect(evalResult?.daysRemaining).toBe(0)
    expect(evalResult?.labelVi).toBe("Hết hạn hôm nay")
  })

  it("evaluates items expiring soon within 3 days", () => {
    const evalResult = evaluateExpiry("2026-10-07", "2026-10-05T00:00:00Z")
    expect(evalResult).not.toBeNull()
    expect(evalResult?.status).toBe("expiring_soon")
    expect(evalResult?.daysRemaining).toBe(2)
    expect(evalResult?.labelVi).toBe("Còn 2 ngày")
  })

  it("evaluates fresh items beyond 3 days", () => {
    const evalResult = evaluateExpiry("2026-10-15", "2026-10-05T00:00:00Z")
    expect(evalResult).not.toBeNull()
    expect(evalResult?.status).toBe("fresh")
    expect(evalResult?.daysRemaining).toBe(10)
    expect(evalResult?.labelVi).toBe("Còn 10 ngày")
  })

  it("returns null for malformed dates", () => {
    expect(evaluateExpiry("invalid-date")).toBeNull()
    expect(evaluateExpiry("")).toBeNull()
  })

  it("persists and loads pantry item expiry dates in local storage", () => {
    const householdId = "hh-123"
    expect(loadPantryExpiries(window.localStorage, householdId)).toEqual({})

    savePantryExpiry(window.localStorage, householdId, "item-1", "2026-10-12")
    savePantryExpiry(window.localStorage, householdId, "item-2", "2026-10-20")

    const loaded = loadPantryExpiries(window.localStorage, householdId)
    expect(loaded["item-1"]).toBe("2026-10-12")
    expect(loaded["item-2"]).toBe("2026-10-20")

    // Removing an expiry date
    savePantryExpiry(window.localStorage, householdId, "item-1", "")
    const afterDelete = loadPantryExpiries(window.localStorage, householdId)
    expect(afterDelete["item-1"]).toBeUndefined()
    expect(afterDelete["item-2"]).toBe("2026-10-20")
  })

  it("correctly identifies urgency with and without explicit expiry dates", () => {
    const today = "2026-10-05T00:00:00Z"
    // Expired or expiring soon is urgent
    expect(isPantryItemUrgent("Gạo", "2026-10-01", today)).toBe(true)
    expect(isPantryItemUrgent("Gạo", "2026-10-06", today)).toBe(true)

    expect(calculatePantryItemUrgency("Gạo", "2026-10-01", today).priority).toBe(10)
    expect(calculatePantryItemUrgency("Gạo", "2026-10-05", today).priority).toBe(9)

    // Fresh explicit date is not urgent even if food name would normally be urgent
    expect(isPantryItemUrgent("Thịt ba chỉ", "2026-10-20", today)).toBe(false)
    expect(calculatePantryItemUrgency("Thịt ba chỉ", "2026-10-20", today).priority).toBe(1)

    // Without expiry date, falls back to food freshness classification
    expect(isPantryItemUrgent("Thịt ba chỉ", undefined, today)).toBe(true)
    expect(calculatePantryItemUrgency("Thịt ba chỉ", undefined, today).priority).toBe(3)
    expect(isPantryItemUrgent("Gạo", undefined, today)).toBe(false)
    expect(calculatePantryItemUrgency("Gạo", undefined, today).priority).toBe(1)
  })

  it("sorts items prioritizing expired and expiring soon ahead of others", () => {
    const today = "2026-10-05T00:00:00Z"
    const items = [
      { id: "1", name: "Gạo", expiry: undefined },
      { id: "2", name: "Sữa tươi", expiry: "2026-10-01" }, // expired (-4 days)
      { id: "3", name: "Thịt heo", expiry: undefined }, // perishable priority 3
      { id: "4", name: "Bánh mì", expiry: "2026-10-06" }, // expiring soon (+1 day)
      { id: "5", name: "Sữa chua", expiry: "2026-10-03" } // expired (-2 days)
    ]

    const sorted = sortPantryItemsByUrgency(
      items,
      (item) => item.name,
      (item) => item.expiry,
      today
    )

    // Expired items should come first (longest overdue first: -4 days, then -2 days)
    expect(sorted[0]?.name).toBe("Sữa tươi")
    expect(sorted[1]?.name).toBe("Sữa chua")
    // Then expiring soon
    expect(sorted[2]?.name).toBe("Bánh mì")
    // Then perishable without expiry
    expect(sorted[3]?.name).toBe("Thịt heo")
    // Then shelf-stable staple
    expect(sorted[4]?.name).toBe("Gạo")
  })
})
