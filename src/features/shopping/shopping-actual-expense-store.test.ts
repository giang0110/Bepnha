import { beforeEach, describe, expect, test } from "vitest"
import {
  clearActualExpense,
  loadActualExpense,
  saveActualExpense
} from "./shopping-actual-expense-store"

describe("shopping-actual-expense-store", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test("loads null when no expense is stored", () => {
    expect(loadActualExpense(localStorage, "rev-123")).toBeNull()
  })

  test("handles undefined storage gracefully", () => {
    expect(loadActualExpense(undefined, "rev-123")).toBeNull()
    expect(saveActualExpense(undefined, "rev-123", 500_000)).toBeNull()
    expect(() => clearActualExpense(undefined, "rev-123")).not.toThrow()
  })

  test("saves and reloads actual expense correctly", () => {
    const saved = saveActualExpense(localStorage, "rev-123", 650_000, "Đã mua đủ đồ ở chợ Hôm")
    expect(saved).not.toBeNull()
    expect(saved?.actualCostVnd).toBe(650_000)
    expect(saved?.note).toBe("Đã mua đủ đồ ở chợ Hôm")
    expect(saved?.recordedAtIso).toBeDefined()

    const loaded = loadActualExpense(localStorage, "rev-123")
    expect(loaded).toEqual(saved)
  })

  test("isolates records by revisionId", () => {
    saveActualExpense(localStorage, "rev-1", 400_000)
    saveActualExpense(localStorage, "rev-2", 800_000)

    expect(loadActualExpense(localStorage, "rev-1")?.actualCostVnd).toBe(400_000)
    expect(loadActualExpense(localStorage, "rev-2")?.actualCostVnd).toBe(800_000)
  })

  test("clears stored expense for a specific revision", () => {
    saveActualExpense(localStorage, "rev-123", 500_000)
    expect(loadActualExpense(localStorage, "rev-123")).not.toBeNull()

    clearActualExpense(localStorage, "rev-123")
    expect(loadActualExpense(localStorage, "rev-123")).toBeNull()
  })

  test("handles corrupted JSON or invalid data safely", () => {
    localStorage.setItem("bepnha:shopping:actual-expense:v1:corrupt", "{invalid:json")
    expect(loadActualExpense(localStorage, "corrupt")).toBeNull()

    localStorage.setItem(
      "bepnha:shopping:actual-expense:v1:bad-schema",
      JSON.stringify({ actualCostVnd: "not-a-number" })
    )
    expect(loadActualExpense(localStorage, "bad-schema")).toBeNull()
  })
})
