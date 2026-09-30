import { describe, expect, test } from "vitest"

import {
  clearCookingProgress,
  loadCookingProgress,
  saveCookingProgress,
  type CookingProgressV1
} from "./cooking-progress-store"

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  }
}

const progress: CookingProgressV1 = {
  version: "cooking-progress-v1",
  revisionId: "revision-1",
  dayIndex: 2,
  stepKey: "1:3",
  timers: {
    "1:3": { startedAt: 1_000, pausedWith: null },
    "1:2": { startedAt: 500, pausedWith: 45 }
  }
}

describe("cooking progress storage", () => {
  test("restores the step and timers only for the exact revision and day", () => {
    const storage = memoryStorage()
    saveCookingProgress(storage, progress)

    expect(loadCookingProgress(storage, "revision-1", 2)).toEqual(progress)
    expect(loadCookingProgress(storage, "revision-2", 2)).toBeNull()
    expect(loadCookingProgress(storage, "revision-1", 3)).toBeNull()
  })

  test("ignores malformed or unsupported stored data", () => {
    const storage = memoryStorage()
    storage.setItem("bepnha:cooking-progress:v1", "not json")
    expect(loadCookingProgress(storage, "revision-1", 2)).toBeNull()

    storage.setItem(
      "bepnha:cooking-progress:v1",
      JSON.stringify({ ...progress, version: "cooking-progress-v2" })
    )
    expect(loadCookingProgress(storage, "revision-1", 2)).toBeNull()
  })

  test("clears only the matching revision and day when cooking is completed", () => {
    const storage = memoryStorage()
    saveCookingProgress(storage, progress)

    clearCookingProgress(storage, "revision-other", 2)
    expect(loadCookingProgress(storage, "revision-1", 2)).toEqual(progress)

    clearCookingProgress(storage, "revision-1", 2)
    expect(loadCookingProgress(storage, "revision-1", 2)).toBeNull()
  })

  test("does not break cooking when browser storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("quota")
      },
      removeItem: () => {
        throw new Error("blocked")
      }
    }

    expect(() => saveCookingProgress(storage, progress)).not.toThrow()
    expect(loadCookingProgress(storage, "revision-1", 2)).toBeNull()
    expect(() => clearCookingProgress(storage, "revision-1", 2)).not.toThrow()
  })
})
