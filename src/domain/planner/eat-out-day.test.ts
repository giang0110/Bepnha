import { describe, expect, it } from "vitest"

import {
  isDayMarkedEatOut,
  summarizeWeeklySchedule,
  type WeeklyScheduleSummary
} from "./eat-out-day"

describe("eat-out-day planner domain", () => {
  it("summarizes schedule when all 7 days are cooked at home", () => {
    const items = [
      { dayIndex: 0, elapsedMinutes: 30 },
      { dayIndex: 1, elapsedMinutes: 45 },
      { dayIndex: 2, elapsedMinutes: 25 },
      { dayIndex: 3, elapsedMinutes: 30 },
      { dayIndex: 4, elapsedMinutes: 40 },
      { dayIndex: 5, elapsedMinutes: 50 },
      { dayIndex: 6, elapsedMinutes: 35 }
    ]

    const summary: WeeklyScheduleSummary = summarizeWeeklySchedule(7, items, [])

    expect(summary.totalDays).toBe(7)
    expect(summary.homeCookingDaysCount).toBe(7)
    expect(summary.eatOutDaysCount).toBe(0)
    expect(summary.totalCookingMinutes).toBe(255)
    expect(summary.averageCookingMinutesPerCookingDay).toBe(36)
  })

  it("correctly calculates cooking minutes excluding eat-out days", () => {
    const items = [
      { dayIndex: 0, elapsedMinutes: 30 },
      { dayIndex: 1, elapsedMinutes: 45 },
      { dayIndex: 2, elapsedMinutes: 25 },
      { dayIndex: 3, elapsedMinutes: 30 },
      { dayIndex: 4, elapsedMinutes: 40 },
      { dayIndex: 5, elapsedMinutes: 50 }, // Saturday: Eat out
      { dayIndex: 6, elapsedMinutes: 35 } // Sunday: Eat out
    ]

    const eatOutDays = [5, 6]
    const summary = summarizeWeeklySchedule(7, items, eatOutDays)

    expect(summary.totalDays).toBe(7)
    expect(summary.homeCookingDaysCount).toBe(5)
    expect(summary.eatOutDaysCount).toBe(2)
    // 30 + 45 + 25 + 30 + 40 = 170
    expect(summary.totalCookingMinutes).toBe(170)
    expect(summary.averageCookingMinutesPerCookingDay).toBe(34)
  })

  it("handles scenario where all days are eat-out", () => {
    const items = [
      { dayIndex: 0, elapsedMinutes: 30 },
      { dayIndex: 1, elapsedMinutes: 45 }
    ]

    const summary = summarizeWeeklySchedule(2, items, [0, 1])

    expect(summary.homeCookingDaysCount).toBe(0)
    expect(summary.eatOutDaysCount).toBe(2)
    expect(summary.totalCookingMinutes).toBe(0)
    expect(summary.averageCookingMinutesPerCookingDay).toBe(0)
  })

  it("identifies if a specific day is marked as eat-out", () => {
    const eatOutDays = [1, 6]

    expect(isDayMarkedEatOut(eatOutDays, 0)).toBe(false)
    expect(isDayMarkedEatOut(eatOutDays, 1)).toBe(true)
    expect(isDayMarkedEatOut(eatOutDays, 5)).toBe(false)
    expect(isDayMarkedEatOut(eatOutDays, 6)).toBe(true)
  })
})
