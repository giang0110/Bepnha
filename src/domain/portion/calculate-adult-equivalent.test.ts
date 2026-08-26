import { describe, expect, test } from "vitest"

import {
  calculateAdultEquivalent,
  type PortionCalculationErrorCode
} from "@/domain/portion/calculate-adult-equivalent"
import { PORTION_CONFIG_V1 } from "@/domain/portion/portion-config"

function expectAdultEquivalent(groups: Parameters<typeof calculateAdultEquivalent>[0]) {
  const result = calculateAdultEquivalent(groups)

  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(`Expected a valid household, received ${result.error.code}`)
  }

  return result.value
}

function expectFailure(
  groups: Parameters<typeof calculateAdultEquivalent>[0],
  code: PortionCalculationErrorCode,
  config?: Parameters<typeof calculateAdultEquivalent>[1]
) {
  const result = calculateAdultEquivalent(groups, config)

  expect(result).toEqual({ ok: false, error: { code } })
}

describe("PORTION_CONFIG_V1", () => {
  test("pins every approved member-band coefficient", () => {
    expect(PORTION_CONFIG_V1).toEqual({
      version: "portion-v1",
      coefficients: {
        adult: "1",
        child_1_3: "0.4",
        child_4_6: "0.55",
        child_7_9: "0.7",
        child_10_12: "0.85",
        child_13_17: "1",
        elderly: "0.85"
      }
    })
    expect(Object.isFrozen(PORTION_CONFIG_V1)).toBe(true)
    expect(Object.isFrozen(PORTION_CONFIG_V1.coefficients)).toBe(true)
  })
})

describe("calculateAdultEquivalent", () => {
  test("calculates the approved golden household deterministically", () => {
    const result = expectAdultEquivalent([
      { memberKind: "elderly", ageBand: "elderly", memberCount: 1 },
      { memberKind: "child", ageBand: "4_6", memberCount: 1 },
      { memberKind: "adult", ageBand: "adult", memberCount: 2 }
    ])

    expect(result.adultEquivalent).toBe("3.4")
    expect(result.memberGroups.map((group) => group.ageBand)).toEqual(["adult", "4_6", "elderly"])
  })

  test("is byte-equivalent when groups arrive in a different order", () => {
    const first = expectAdultEquivalent([
      { memberKind: "elderly", ageBand: "elderly", memberCount: 1 },
      { memberKind: "adult", ageBand: "adult", memberCount: 2 }
    ])
    const second = expectAdultEquivalent([
      { memberKind: "adult", ageBand: "adult", memberCount: 2 },
      { memberKind: "elderly", ageBand: "elderly", memberCount: 1 }
    ])

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  test("rejects unsupported, duplicate, inconsistent, or invalid groups", () => {
    expectFailure(
      [{ memberKind: "child", ageBand: "18_20", memberCount: 1 }],
      "UNSUPPORTED_MEMBER_BAND"
    )
    expectFailure(
      [
        { memberKind: "adult", ageBand: "adult", memberCount: 1 },
        { memberKind: "adult", ageBand: "adult", memberCount: 1 }
      ],
      "INVALID_MEMBER_GROUPS"
    )
    expectFailure(
      [{ memberKind: "adult", ageBand: "elderly", memberCount: 1 }],
      "INVALID_MEMBER_GROUPS"
    )
    expectFailure(
      [{ memberKind: "adult", ageBand: "adult", memberCount: 0 }],
      "INVALID_MEMBER_TOTAL"
    )
    expectFailure(
      [{ memberKind: "adult", ageBand: "adult", memberCount: 21 }],
      "INVALID_MEMBER_TOTAL"
    )
  })

  test("rejects an altered or invalid coefficient config", () => {
    expectFailure(
      [{ memberKind: "adult", ageBand: "adult", memberCount: 1 }],
      "INVALID_PORTION_CONFIG",
      {
        ...PORTION_CONFIG_V1,
        coefficients: { ...PORTION_CONFIG_V1.coefficients, adult: "0" }
      }
    )
  })
})
