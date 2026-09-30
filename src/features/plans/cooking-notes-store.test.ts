import { describe, expect, test } from "vitest"
import { clearCookingNote, loadCookingNote, saveCookingNote } from "./cooking-notes-store"

describe("cooking-notes-store", () => {
  const mealOptionId = "meal-thit-kho-trung"

  test("returns null when no cooking note is stored", () => {
    const storage = window.localStorage
    storage.clear()
    expect(loadCookingNote(storage, mealOptionId)).toBeNull()
  })

  test("saves and loads a cooking note for a specific meal option", () => {
    const storage = window.localStorage
    storage.clear()

    const note = "Nhà mình thích kho nhạt nước dừa, luộc trứng 6 phút."
    saveCookingNote(storage, mealOptionId, note)

    expect(loadCookingNote(storage, mealOptionId)).toBe(note)
  })

  test("trims whitespace and ignores empty notes on save", () => {
    const storage = window.localStorage
    storage.clear()

    saveCookingNote(storage, mealOptionId, "   ")
    expect(loadCookingNote(storage, mealOptionId)).toBeNull()
  })

  test("clears a cooking note", () => {
    const storage = window.localStorage
    storage.clear()

    saveCookingNote(storage, mealOptionId, "Lưu ý cá cần rán sơ trước khi kho")
    expect(loadCookingNote(storage, mealOptionId)).not.toBeNull()

    clearCookingNote(storage, mealOptionId)
    expect(loadCookingNote(storage, mealOptionId)).toBeNull()
  })

  test("isolates notes between different meal options", () => {
    const storage = window.localStorage
    storage.clear()

    saveCookingNote(storage, "meal-1", "Mẹo món 1")
    saveCookingNote(storage, "meal-2", "Mẹo món 2")

    expect(loadCookingNote(storage, "meal-1")).toBe("Mẹo món 1")
    expect(loadCookingNote(storage, "meal-2")).toBe("Mẹo món 2")
  })
})
