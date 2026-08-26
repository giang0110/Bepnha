import { describe, expect, test } from "vitest"

import { HOUSEHOLD_RULE_OPTIONS, type HouseholdRuleCode } from "@/domain/household/household-rules"
import {
  validateHouseholdSetup,
  type HouseholdSetupValidationErrorCode
} from "@/domain/household/validate-household-setup"

const validInput = {
  memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
  weeklyPlanBudgetVnd: 1_000_000,
  maxElapsedMinutes: 30,
  ruleCodes: []
} as const

function expectValid(input: unknown) {
  const result = validateHouseholdSetup(input)

  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(`Expected valid input, received ${result.errors[0]?.code ?? "unknown"}`)
  }

  return result.value
}

function expectInvalid(input: unknown, code: HouseholdSetupValidationErrorCode) {
  const result = validateHouseholdSetup(input)

  expect(result.ok).toBe(false)
  if (result.ok) {
    throw new Error("Expected invalid input")
  }

  expect(result.errors.map((error) => error.code)).toContain(code)
}

describe("validateHouseholdSetup", () => {
  test("normalizes every supported age band into deterministic planning order and omits zero drafts", () => {
    const value = expectValid({
      ...validInput,
      memberGroups: [
        { memberKind: "elderly", ageBand: "elderly", memberCount: 1 },
        { memberKind: "child", ageBand: "13_17", memberCount: 1 },
        { memberKind: "child", ageBand: "4_6", memberCount: 1 },
        { memberKind: "adult", ageBand: "adult", memberCount: 1 },
        { memberKind: "child", ageBand: "1_3", memberCount: 1 },
        { memberKind: "child", ageBand: "10_12", memberCount: 1 },
        { memberKind: "child", ageBand: "7_9", memberCount: 1 },
        { memberKind: "child", ageBand: "4_6", memberCount: 0 }
      ]
    })

    expect(value.memberGroups).toEqual([
      { memberKind: "adult", ageBand: "adult", memberCount: 1 },
      { memberKind: "child", ageBand: "1_3", memberCount: 1 },
      { memberKind: "child", ageBand: "4_6", memberCount: 1 },
      { memberKind: "child", ageBand: "7_9", memberCount: 1 },
      { memberKind: "child", ageBand: "10_12", memberCount: 1 },
      { memberKind: "child", ageBand: "13_17", memberCount: 1 },
      { memberKind: "elderly", ageBand: "elderly", memberCount: 1 }
    ])
  })

  test.each([1, 20])("accepts a supported-member total of %i", (memberCount) => {
    const value = expectValid({
      ...validInput,
      memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount }]
    })

    expect(value.memberGroups[0]?.memberCount).toBe(memberCount)
  })

  test("rejects a supported-member total of zero", () => {
    expectInvalid(
      {
        ...validInput,
        memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 0 }]
      },
      "INVALID_MEMBER_TOTAL"
    )
  })

  test("rejects a supported-member total of 21 across individually valid groups", () => {
    expectInvalid(
      {
        ...validInput,
        memberGroups: [
          { memberKind: "adult", ageBand: "adult", memberCount: 20 },
          { memberKind: "elderly", ageBand: "elderly", memberCount: 1 }
        ]
      },
      "INVALID_MEMBER_TOTAL"
    )
  })

  test("rejects duplicate non-zero member groups", () => {
    expectInvalid(
      {
        ...validInput,
        memberGroups: [
          { memberKind: "child", ageBand: "4_6", memberCount: 1 },
          { memberKind: "child", ageBand: "4_6", memberCount: 2 }
        ]
      },
      "DUPLICATE_MEMBER_GROUP"
    )
  })

  test.each([
    { memberKind: "adult", ageBand: "1_3", memberCount: 1 },
    { memberKind: "child", ageBand: "adult", memberCount: 1 },
    { memberKind: "elderly", ageBand: "elderly", memberCount: 1.5 },
    { memberKind: "child", ageBand: "under_1", memberCount: 1 },
    { memberKind: "adult", ageBand: "adult", memberCount: -1 },
    { memberKind: "adult", ageBand: "adult", memberCount: 21 }
  ])("rejects an unsupported member group $memberKind/$ageBand/$memberCount", (group) => {
    expectInvalid({ ...validInput, memberGroups: [group] }, "INVALID_MEMBER_GROUP")
  })

  test.each([1, 100_000_000])("accepts budget boundary %i VND", (weeklyPlanBudgetVnd) => {
    expect(expectValid({ ...validInput, weeklyPlanBudgetVnd }).weeklyPlanBudgetVnd).toBe(
      weeklyPlanBudgetVnd
    )
  })

  test.each([0, 100_000_001, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid budget %s",
    (weeklyPlanBudgetVnd) => {
      expectInvalid({ ...validInput, weeklyPlanBudgetVnd }, "INVALID_BUDGET")
    }
  )

  test.each([10, 180])("accepts elapsed-time boundary %i minutes", (maxElapsedMinutes) => {
    expect(expectValid({ ...validInput, maxElapsedMinutes }).maxElapsedMinutes).toBe(
      maxElapsedMinutes
    )
  })

  test.each([9, 181, 30.5])("rejects invalid elapsed time %s", (maxElapsedMinutes) => {
    expectInvalid({ ...validInput, maxElapsedMinutes }, "INVALID_MAX_ELAPSED_MINUTES")
  })

  test("rejects unknown canonical rule codes", () => {
    expectInvalid({ ...validInput, ruleCodes: ["allergen_unstructured"] }, "UNKNOWN_RULE_CODE")
  })

  test("deduplicates and sorts selected rule codes by canonical option order", () => {
    const value = expectValid({
      ...validInput,
      ruleCodes: ["prefer_soup", "exclude_beef", "allergen_milk", "exclude_beef"]
    })

    expect(value.ruleCodes).toEqual(["allergen_milk", "exclude_beef", "prefer_soup"])
  })

  test.each([
    ["exclude_pork", "prefer_pork"],
    ["exclude_beef", "prefer_beef"],
    ["exclude_poultry", "prefer_poultry"],
    ["exclude_seafood", "prefer_seafood"]
  ] as const)("rejects hard and soft rules for the same target: %s/%s", (hard, soft) => {
    expectInvalid({ ...validInput, ruleCodes: [hard, soft] }, "CONFLICTING_RULE_TARGET")
  })

  test("returns byte-equivalent normalized values across repeated calls", () => {
    const input = {
      ...validInput,
      memberGroups: [
        { memberKind: "elderly", ageBand: "elderly", memberCount: 1 },
        { memberKind: "adult", ageBand: "adult", memberCount: 2 }
      ],
      ruleCodes: ["prefer_tofu", "allergen_soy"]
    }

    expect(JSON.stringify(expectValid(input))).toBe(JSON.stringify(expectValid(input)))
  })
})

describe("HOUSEHOLD_RULE_OPTIONS", () => {
  test("accepts every migration-owned canonical rule code", () => {
    const codes = HOUSEHOLD_RULE_OPTIONS.map((option) => option.code)

    expect(codes).toHaveLength(26)
    for (const code of codes) {
      expect(expectValid({ ...validInput, ruleCodes: [code] }).ruleCodes).toEqual([code])
    }
  })

  test("keeps hard exclusions and soft preferences structurally distinct", () => {
    const byCode = new Map<HouseholdRuleCode, (typeof HOUSEHOLD_RULE_OPTIONS)[number]>(
      HOUSEHOLD_RULE_OPTIONS.map((option) => [option.code, option])
    )

    expect(byCode.get("allergen_other")).toMatchObject({
      ruleKind: "allergen_exclusion",
      targetKey: "unsupported_allergen"
    })
    expect(byCode.get("exclude_egg")).toMatchObject({
      ruleKind: "food_exclusion",
      targetKey: "egg"
    })
    expect(byCode.get("prefer_fish")).toMatchObject({
      ruleKind: "soft_preference",
      targetKey: "fish"
    })
  })
})
