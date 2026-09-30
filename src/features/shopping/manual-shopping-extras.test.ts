import { describe, expect, test } from "vitest"

import {
  addManualShoppingExtra,
  loadManualShoppingExtras,
  removeManualShoppingExtra,
  toggleManualShoppingExtra
} from "./manual-shopping-extras"

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  }
}

describe("device-local manual shopping extras", () => {
  test("adds bounded text to one exact revision without authoritative quantities or cost", () => {
    const storage = memoryStorage()
    addManualShoppingExtra(storage, "revision-a", "  Túi rác  ", () => "extra-1")

    expect(loadManualShoppingExtras(storage, "revision-a")).toEqual([
      { id: "extra-1", revisionId: "revision-a", label: "Túi rác", checked: false }
    ])
    expect(loadManualShoppingExtras(storage, "revision-b")).toEqual([])
  })

  test("toggles and removes only the selected local extra", () => {
    const storage = memoryStorage()
    addManualShoppingExtra(storage, "revision-a", "Túi rác", () => "extra-1")
    addManualShoppingExtra(storage, "revision-a", "Khăn giấy", () => "extra-2")

    toggleManualShoppingExtra(storage, "revision-a", "extra-1", true)
    removeManualShoppingExtra(storage, "revision-a", "extra-2")

    expect(loadManualShoppingExtras(storage, "revision-a")).toEqual([
      { id: "extra-1", revisionId: "revision-a", label: "Túi rác", checked: true }
    ])
  })

  test("rejects blank text and trims a label to 80 characters", () => {
    const storage = memoryStorage()
    expect(addManualShoppingExtra(storage, "revision-a", "   ", () => "blank")).toBe(false)
    expect(addManualShoppingExtra(storage, "revision-a", "a".repeat(100), () => "long")).toBe(true)
    expect(loadManualShoppingExtras(storage, "revision-a")[0]?.label).toHaveLength(80)
  })
})
