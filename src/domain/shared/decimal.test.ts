import { describe, expect, test } from "vitest"

import {
  ROUND_CEIL,
  ROUND_HALF_UP,
  decimalToCanonical,
  parseCanonicalDecimal,
  roundDecimal
} from "@/domain/shared/decimal"

function expectDecimal(input: string, maxScale?: number) {
  const result = parseCanonicalDecimal(input, maxScale === undefined ? undefined : { maxScale })

  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(`Expected ${input} to be valid`)
  }

  return result.value
}

describe("parseCanonicalDecimal", () => {
  test.each(["0", "1", "-1", "0.1", "10.250", "999999999999999999.999999"])(
    "accepts canonical decimal syntax: %s",
    (input) => {
      expect(parseCanonicalDecimal(input).ok).toBe(true)
    }
  )

  test.each([
    "",
    " 1",
    "1 ",
    "+1",
    "01",
    "-0",
    "-0.0",
    ".5",
    "1.",
    "1e3",
    "1,5",
    "NaN",
    "Infinity",
    "-Infinity"
  ])("rejects non-canonical decimal syntax: %s", (input) => {
    expect(parseCanonicalDecimal(input)).toEqual({
      ok: false,
      error: { code: "INVALID_DECIMAL", input }
    })
  })

  test("rejects values beyond the configured fractional scale", () => {
    expect(parseCanonicalDecimal("1.234", { maxScale: 2 })).toEqual({
      ok: false,
      error: { code: "INVALID_DECIMAL", input: "1.234" }
    })
  })

  test("rejects an invalid scale configuration", () => {
    expect(parseCanonicalDecimal("1", { maxScale: -1 })).toEqual({
      ok: false,
      error: { code: "INVALID_DECIMAL", input: "1" }
    })
  })
})

describe("exact decimal operations", () => {
  test("does not inherit binary floating-point addition errors", () => {
    const sum = expectDecimal("0.1").plus(expectDecimal("0.2"))

    expect(decimalToCanonical(sum)).toBe("0.3")
  })

  test("normalizes insignificant zeroes and always serializes zero as zero", () => {
    expect(decimalToCanonical(expectDecimal("10.2500"))).toBe("10.25")
    expect(decimalToCanonical(expectDecimal("0.000"))).toBe("0")
  })

  test("uses explicit half-up and ceiling modes", () => {
    expect(roundDecimal(expectDecimal("2.345"), 2, ROUND_HALF_UP)).toBe("2.35")
    expect(roundDecimal(expectDecimal("2.341"), 2, ROUND_CEIL)).toBe("2.35")
    expect(roundDecimal(expectDecimal("-2.341"), 2, ROUND_CEIL)).toBe("-2.34")
  })

  test("retains precision beyond JavaScript safe integer arithmetic", () => {
    const product = expectDecimal("999999999999999999.999999").times(expectDecimal("3"))

    expect(decimalToCanonical(product)).toBe("2999999999999999999.999997")
  })
})
