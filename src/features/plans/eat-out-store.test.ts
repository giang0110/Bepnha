import { beforeEach, describe, expect, it } from "vitest"

import {
  clearEatOutDays,
  loadEatOutDays,
  setEatOutDayReason,
  toggleEatOutDay,
  type EatOutDayRecord
} from "./eat-out-store"

describe("eat-out-store", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("returns empty array when no eat-out records exist", () => {
    expect(loadEatOutDays(localStorage, "rev-1")).toEqual([])
  })

  it("toggles eat-out day on and off correctly", () => {
    const afterFirstToggle = toggleEatOutDay(localStorage, "rev-1", 5, "Đi ăn cỗ cưới")
    expect(afterFirstToggle).toEqual<EatOutDayRecord[]>([
      { dayIndex: 5, reasonNote: "Đi ăn cỗ cưới" }
    ])

    const loaded = loadEatOutDays(localStorage, "rev-1")
    expect(loaded).toEqual(afterFirstToggle)

    // Toggle off
    const afterSecondToggle = toggleEatOutDay(localStorage, "rev-1", 5)
    expect(afterSecondToggle).toEqual([])
    expect(loadEatOutDays(localStorage, "rev-1")).toEqual([])
  })

  it("supports multiple days and isolates across revisions", () => {
    toggleEatOutDay(localStorage, "rev-1", 5, "Thứ Bảy")
    toggleEatOutDay(localStorage, "rev-1", 6, "Chủ Nhật")

    const rev1Days = loadEatOutDays(localStorage, "rev-1")
    expect(rev1Days.map((d) => d.dayIndex)).toEqual([5, 6])

    // rev-2 is empty
    expect(loadEatOutDays(localStorage, "rev-2")).toEqual([])
  })

  it("updates reason note for an already marked eat-out day", () => {
    toggleEatOutDay(localStorage, "rev-1", 6, "Ăn ngoài")
    const updated = setEatOutDayReason(localStorage, "rev-1", 6, "Về quê ăn cơm với ông bà")

    expect(updated).toEqual<EatOutDayRecord[]>([
      { dayIndex: 6, reasonNote: "Về quê ăn cơm với ông bà" }
    ])
  })

  it("clears all eat-out days for a revision", () => {
    toggleEatOutDay(localStorage, "rev-1", 5)
    toggleEatOutDay(localStorage, "rev-1", 6)

    clearEatOutDays(localStorage, "rev-1")
    expect(loadEatOutDays(localStorage, "rev-1")).toEqual([])
  })
})
