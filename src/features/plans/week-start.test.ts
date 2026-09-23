import { describe, expect, test } from "vitest"

import { planWeekStart } from "./week-start"

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
