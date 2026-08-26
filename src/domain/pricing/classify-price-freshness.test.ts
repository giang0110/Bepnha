import { describe, expect, test } from "vitest"

import {
  classifyPriceFreshness,
  type FatalPriceError
} from "@/domain/pricing/classify-price-freshness"
import { PRICE_FRESHNESS_CONFIG_V1 } from "@/domain/pricing/pricing"

type Assert<T extends true> = T
type StaleIsNotFatal = Assert<"STALE_PRICE" extends FatalPriceError["code"] ? false : true>
const staleIsNotFatal: StaleIsNotFatal = true

describe("PRICE_FRESHNESS_CONFIG_V1", () => {
  test("pins immutable freshness thresholds", () => {
    expect(staleIsNotFatal).toBe(true)
    expect(PRICE_FRESHNESS_CONFIG_V1).toEqual({
      version: "price-freshness-v1",
      currentMaxAgeDays: 30,
      usableMaxAgeDays: 90
    })
    expect(Object.isFrozen(PRICE_FRESHNESS_CONFIG_V1)).toBe(true)
  })
})

describe("classifyPriceFreshness", () => {
  test.each([
    ["2026-08-27", { ok: false, error: { code: "FUTURE_PRICE" } }],
    ["2026-08-26", { ok: true, freshness: "current", warnings: [] }],
    ["2026-07-27", { ok: true, freshness: "current", warnings: [] }],
    [
      "2026-07-26",
      {
        ok: true,
        freshness: "stale_usable",
        warnings: [{ code: "STALE_PRICE", observedAt: "2026-07-26", ageDays: 31 }]
      }
    ],
    [
      "2026-05-28",
      {
        ok: true,
        freshness: "stale_usable",
        warnings: [{ code: "STALE_PRICE", observedAt: "2026-05-28", ageDays: 90 }]
      }
    ],
    ["2026-05-27", { ok: false, error: { code: "PRICE_TOO_OLD" } }]
  ] as const)("classifies observed date %s at the exact boundary", (observedAt, expected) => {
    expect(classifyPriceFreshness(observedAt, "2026-08-26")).toEqual(expected)
  })

  test("treats a missing price as fatal", () => {
    expect(classifyPriceFreshness(null, "2026-08-26")).toEqual({
      ok: false,
      error: { code: "MISSING_PRICE" }
    })
  })

  test.each(["2026-02-30", "26-08-2026", "2026-08-26T00:00:00Z"])(
    "rejects invalid ISO calendar date %s",
    (date) => {
      expect(classifyPriceFreshness(date, "2026-08-26")).toEqual({
        ok: false,
        error: { code: "INVALID_PRICE_DATE" }
      })
    }
  )

  test("rejects a changed or invalid freshness config", () => {
    expect(
      classifyPriceFreshness("2026-08-26", "2026-08-26", {
        ...PRICE_FRESHNESS_CONFIG_V1,
        currentMaxAgeDays: 31
      })
    ).toEqual({ ok: false, error: { code: "INVALID_PRICE_CONFIG" } })
  })
})
