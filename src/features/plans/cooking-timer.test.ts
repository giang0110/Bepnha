import { describe, expect, test } from "vitest"

import { formatCountdown, secondsRemaining } from "./cooking-timer"

describe("formatCountdown", () => {
  test("keeps a fixed width so the digits do not jump while running", () => {
    expect(formatCountdown(600)).toBe("10:00")
    expect(formatCountdown(65)).toBe("1:05")
    expect(formatCountdown(9)).toBe("0:09")
  })

  test("clamps at zero rather than counting past it", () => {
    // "-0:03" would claim the app is measuring something after the timer finished. It is not.
    expect(formatCountdown(0)).toBe("0:00")
    expect(formatCountdown(-30)).toBe("0:00")
  })

  test("rounds up, so a timer reads 1:00 until the last second is actually gone", () => {
    expect(formatCountdown(59.4)).toBe("1:00")
  })
})

describe("secondsRemaining", () => {
  const start = 1_000_000

  test("reads the full duration before it is started", () => {
    expect(secondsRemaining(360, null, null, start)).toBe(360)
  })

  test("is derived from the clock, not from how many ticks were observed", () => {
    // This is the point of storing a start rather than a count: a phone throttles a hidden tab, so
    // an interval-driven timer finishes late by however long the cook looked away. This one does
    // not, because returning after 200 seconds shows 200 seconds gone.
    expect(secondsRemaining(360, start, null, start + 200_000)).toBe(160)
  })

  test("stops at zero once the time is up", () => {
    expect(secondsRemaining(360, start, null, start + 400_000)).toBe(0)
  })

  test("holds still while paused, whatever the clock does", () => {
    expect(secondsRemaining(360, start, 125, start + 999_000)).toBe(125)
  })
})
