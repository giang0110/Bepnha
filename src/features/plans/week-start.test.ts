import { describe, expect, test } from "vitest"

import { currentWeekStart, nextWeekStart, planWeekStart } from "./week-start"

describe("planWeekStart", () => {
  test("plans for today when today is Monday", () => {
    expect(planWeekStart(new Date("2026-09-21T08:00:00"))).toBe("2026-09-21")
  })

  test("plans for the Monday ahead on any other day", () => {
    expect(planWeekStart(new Date("2026-09-22T08:00:00"))).toBe("2026-09-28")
    expect(planWeekStart(new Date("2026-09-27T23:30:00"))).toBe("2026-09-28")
  })

  test("crosses a month and a year boundary", () => {
    expect(planWeekStart(new Date("2026-12-31T10:00:00"))).toBe("2027-01-04")
  })

  test("is the same week for the plan page and the cooking screen on the same day", () => {
    // The two screens call this independently; a cook who taps through from the plan must reach
    // the week they were just looking at.
    const morning = planWeekStart(new Date("2026-09-24T06:00:00"))
    const evening = planWeekStart(new Date("2026-09-24T21:45:00"))

    expect(morning).toBe(evening)
  })
})

describe("currentWeekStart", () => {
  test("is the Monday the household is already living in, every day of the week", () => {
    // planWeekStart answers "2026-09-28" for all of these, which is the week ahead. Used as the
    // plan page's only question that hid the plan they were cooking from.
    expect(currentWeekStart(new Date("2026-09-21T08:00:00"))).toBe("2026-09-21")
    expect(currentWeekStart(new Date("2026-09-22T08:00:00"))).toBe("2026-09-21")
    expect(currentWeekStart(new Date("2026-09-24T23:30:00"))).toBe("2026-09-21")
    expect(currentWeekStart(new Date("2026-09-27T23:30:00"))).toBe("2026-09-21")
  })

  test("treats Sunday as the end of its week, not the day before the next one", () => {
    // getDay() is 0 for Sunday, which is the easiest day of the week to get wrong.
    expect(currentWeekStart(new Date("2026-09-27T12:00:00"))).toBe("2026-09-21")
    expect(currentWeekStart(new Date("2026-09-28T12:00:00"))).toBe("2026-09-28")
  })

  test("crosses a month and a year boundary", () => {
    expect(currentWeekStart(new Date("2027-01-01T10:00:00"))).toBe("2026-12-28")
  })
})

describe("nextWeekStart", () => {
  test("is always a different week from the one being lived in", () => {
    for (const day of ["2026-09-21", "2026-09-24", "2026-09-27"]) {
      const date = new Date(`${day}T12:00:00`)
      expect(nextWeekStart(date)).toBe("2026-09-28")
      expect(nextWeekStart(date)).not.toBe(currentWeekStart(date))
    }
  })
})
