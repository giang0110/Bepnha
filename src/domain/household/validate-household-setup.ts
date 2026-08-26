import { z } from "zod"

import {
  CHILD_AGE_BANDS,
  type HouseholdMemberGroup,
  type HouseholdSetupInput
} from "@/domain/household/household"
import {
  HOUSEHOLD_RULE_OPTION_BY_CODE,
  type HouseholdRuleCode,
  type HouseholdRuleOption
} from "@/domain/household/household-rules"

const childAgeBandSchema = z.enum(CHILD_AGE_BANDS)
const memberGroupSchema = z.discriminatedUnion("memberKind", [
  z
    .object({
      memberKind: z.literal("adult"),
      ageBand: z.literal("adult"),
      memberCount: z.number()
    })
    .strict(),
  z
    .object({
      memberKind: z.literal("child"),
      ageBand: childAgeBandSchema,
      memberCount: z.number()
    })
    .strict(),
  z
    .object({
      memberKind: z.literal("elderly"),
      ageBand: z.literal("elderly"),
      memberCount: z.number()
    })
    .strict()
])

const inputShapeSchema = z
  .object({
    memberGroups: z.array(z.unknown()),
    weeklyPlanBudgetVnd: z.unknown(),
    maxElapsedMinutes: z.unknown(),
    ruleCodes: z.array(z.unknown())
  })
  .strict()

const MEMBER_ORDER = new Map([
  ["adult:adult", 0],
  ["child:1_3", 1],
  ["child:4_6", 2],
  ["child:7_9", 3],
  ["child:10_12", 4],
  ["child:13_17", 5],
  ["elderly:elderly", 6]
])

export type HouseholdSetupValidationErrorCode =
  | "INVALID_INPUT"
  | "INVALID_MEMBER_GROUP"
  | "DUPLICATE_MEMBER_GROUP"
  | "INVALID_MEMBER_TOTAL"
  | "INVALID_BUDGET"
  | "INVALID_MAX_ELAPSED_MINUTES"
  | "UNKNOWN_RULE_CODE"
  | "CONFLICTING_RULE_TARGET"

export interface HouseholdSetupValidationError {
  code: HouseholdSetupValidationErrorCode
  path: "input" | "memberGroups" | "weeklyPlanBudgetVnd" | "maxElapsedMinutes" | "ruleCodes"
}

type HouseholdSetupValidationFailure = {
  ok: false
  errors: readonly HouseholdSetupValidationError[]
}

export type HouseholdSetupValidationResult =
  { ok: true; value: HouseholdSetupInput } | HouseholdSetupValidationFailure

function invalid(
  code: HouseholdSetupValidationErrorCode,
  path: HouseholdSetupValidationError["path"]
): HouseholdSetupValidationFailure {
  return { ok: false, errors: [{ code, path }] }
}

function normalizeMemberGroups(
  rawGroups: readonly unknown[]
): readonly HouseholdMemberGroup[] | HouseholdSetupValidationFailure {
  const groups: HouseholdMemberGroup[] = []
  const keys = new Set<string>()

  for (const rawGroup of rawGroups) {
    const parsed = memberGroupSchema.safeParse(rawGroup)
    if (!parsed.success) {
      return invalid("INVALID_MEMBER_GROUP", "memberGroups")
    }

    const group = parsed.data
    if (!Number.isInteger(group.memberCount) || group.memberCount < 0 || group.memberCount > 20) {
      return invalid("INVALID_MEMBER_GROUP", "memberGroups")
    }
    if (group.memberCount === 0) {
      continue
    }

    const key = `${group.memberKind}:${group.ageBand}`
    if (keys.has(key)) {
      return invalid("DUPLICATE_MEMBER_GROUP", "memberGroups")
    }
    keys.add(key)
    groups.push(group)
  }

  const total = groups.reduce((sum, group) => sum + group.memberCount, 0)
  if (total < 1 || total > 20) {
    return invalid("INVALID_MEMBER_TOTAL", "memberGroups")
  }

  return groups.toSorted(
    (left, right) =>
      (MEMBER_ORDER.get(`${left.memberKind}:${left.ageBand}`) ?? Number.MAX_SAFE_INTEGER) -
      (MEMBER_ORDER.get(`${right.memberKind}:${right.ageBand}`) ?? Number.MAX_SAFE_INTEGER)
  )
}

function normalizeRuleCodes(
  rawRuleCodes: readonly unknown[]
): readonly HouseholdRuleCode[] | HouseholdSetupValidationFailure {
  const selected = new Map<HouseholdRuleCode, HouseholdRuleOption>()

  for (const rawCode of rawRuleCodes) {
    if (typeof rawCode !== "string") {
      return invalid("UNKNOWN_RULE_CODE", "ruleCodes")
    }
    const option = HOUSEHOLD_RULE_OPTION_BY_CODE.get(rawCode as HouseholdRuleCode)
    if (option === undefined) {
      return invalid("UNKNOWN_RULE_CODE", "ruleCodes")
    }
    selected.set(option.code, option)
  }

  const options = [...selected.values()]
  const hardTargets = new Set<string>(
    options
      .filter((option) => option.ruleKind !== "soft_preference")
      .map((option) => option.targetKey)
  )
  if (
    options.some(
      (option) => option.ruleKind === "soft_preference" && hardTargets.has(option.targetKey)
    )
  ) {
    return invalid("CONFLICTING_RULE_TARGET", "ruleCodes")
  }

  return options
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((option) => option.code)
}

function isValidationFailure(
  value: readonly unknown[] | HouseholdSetupValidationFailure
): value is HouseholdSetupValidationFailure {
  return !Array.isArray(value)
}

export function validateHouseholdSetup(input: unknown): HouseholdSetupValidationResult {
  const shape = inputShapeSchema.safeParse(input)
  if (!shape.success) {
    return invalid("INVALID_INPUT", "input")
  }

  const memberGroups = normalizeMemberGroups(shape.data.memberGroups)
  if (isValidationFailure(memberGroups)) {
    return memberGroups
  }

  const budget = shape.data.weeklyPlanBudgetVnd
  if (!Number.isSafeInteger(budget) || (budget as number) < 1 || (budget as number) > 100_000_000) {
    return invalid("INVALID_BUDGET", "weeklyPlanBudgetVnd")
  }

  const maxElapsedMinutes = shape.data.maxElapsedMinutes
  if (
    !Number.isInteger(maxElapsedMinutes) ||
    (maxElapsedMinutes as number) < 10 ||
    (maxElapsedMinutes as number) > 180
  ) {
    return invalid("INVALID_MAX_ELAPSED_MINUTES", "maxElapsedMinutes")
  }

  const ruleCodes = normalizeRuleCodes(shape.data.ruleCodes)
  if (isValidationFailure(ruleCodes)) {
    return ruleCodes
  }

  return {
    ok: true,
    value: {
      memberGroups,
      weeklyPlanBudgetVnd: budget as number,
      maxElapsedMinutes: maxElapsedMinutes as number,
      ruleCodes
    }
  }
}
