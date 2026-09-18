import type { SupabaseClient } from "@supabase/supabase-js"

import {
  HouseholdRepositoryError,
  type HouseholdRepository,
  type SaveHouseholdResult
} from "@/application/household/household-repository"
import {
  CHILD_AGE_BANDS,
  type ChildAgeBand,
  type HouseholdMemberGroup,
  type HouseholdSetup
} from "@/domain/household/household"
import {
  DEFAULT_ALLERGEN_STRICTNESS,
  isAllergenStrictness,
  resolveAllergenStrictness,
  type AllergenStrictness
} from "@/domain/household/allergen-strictness"
import { validateHouseholdSetup } from "@/domain/household/validate-household-setup"

import type { Database } from "./database.types.js"

const HOUSEHOLD_SELECT = `
  id,
  weekly_plan_budget_vnd,
  max_elapsed_minutes,
  onboarding_completed_at,
  version,
  household_member_groups(member_kind, age_band, member_count),
  household_food_rules(
    rule_code,
    allergen_strictness,
    household_rule_options(code, target_key, rule_kind, label_vi, sort_order)
  )
`

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseSafeInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : null
  }
  if (typeof value !== "string" || !/^\d+$/u.test(value)) {
    return null
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function parseMemberGroups(value: unknown): HouseholdMemberGroup[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const groups: HouseholdMemberGroup[] = []
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      return null
    }
    const memberKind = candidate.member_kind
    const ageBand = candidate.age_band
    const memberCount = candidate.member_count
    if (typeof memberCount !== "number") {
      return null
    }
    if (memberKind === "adult" && ageBand === "adult") {
      groups.push({ memberKind, ageBand, memberCount })
    } else if (memberKind === "child" && CHILD_AGE_BANDS.includes(ageBand as ChildAgeBand)) {
      groups.push({ memberKind, ageBand: ageBand as ChildAgeBand, memberCount })
    } else if (memberKind === "elderly" && ageBand === "elderly") {
      groups.push({ memberKind, ageBand, memberCount })
    } else {
      return null
    }
  }
  return groups
}

function parseRuleCodes(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const codes: string[] = []
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.rule_code !== "string") {
      return null
    }
    const option = candidate.household_rule_options
    if (!isRecord(option) || option.code !== candidate.rule_code) {
      return null
    }
    codes.push(candidate.rule_code)
  }
  return codes
}

function mapStoredHousehold(value: unknown): HouseholdSetup {
  if (!isRecord(value)) {
    throw new HouseholdRepositoryError("INVALID_STORED_DATA")
  }
  const weeklyPlanBudgetVnd = parseSafeInteger(value.weekly_plan_budget_vnd)
  const maxElapsedMinutes = parseSafeInteger(value.max_elapsed_minutes)
  const version = parseSafeInteger(value.version)
  const memberGroups = parseMemberGroups(value.household_member_groups)
  const ruleCodes = parseRuleCodes(value.household_food_rules)
  const allergenStrictness = parseAllergenStrictness(value.household_food_rules)
  if (
    typeof value.id !== "string" ||
    value.id === "" ||
    typeof value.onboarding_completed_at !== "string" ||
    value.onboarding_completed_at === "" ||
    weeklyPlanBudgetVnd === null ||
    maxElapsedMinutes === null ||
    version === null ||
    version < 1 ||
    memberGroups === null ||
    ruleCodes === null
  ) {
    throw new HouseholdRepositoryError("INVALID_STORED_DATA")
  }

  const validation = validateHouseholdSetup({
    memberGroups,
    weeklyPlanBudgetVnd,
    maxElapsedMinutes,
    ruleCodes,
    allergenStrictness
  })
  if (!validation.ok) {
    throw new HouseholdRepositoryError("INVALID_STORED_DATA")
  }
  return {
    householdId: value.id,
    ...validation.value,
    version,
    onboardingCompletedAt: value.onboarding_completed_at
  }
}

/**
 * Reads each rule's stored reach back out of the join rows.
 *
 * Only a departure from the default is kept, so the shape that comes back matches the one that goes
 * out and a row whose value did not survive storage reads as `strict` rather than as permission.
 */
function parseAllergenStrictness(value: unknown): Record<string, AllergenStrictness> {
  const strictness: Record<string, AllergenStrictness> = {}
  if (!Array.isArray(value)) return strictness
  for (const raw of value) {
    if (!isRecord(raw)) continue
    const ruleCode = raw.rule_code
    const declared = raw.allergen_strictness
    if (typeof ruleCode !== "string" || !isAllergenStrictness(declared)) continue
    if (declared !== DEFAULT_ALLERGEN_STRICTNESS) strictness[ruleCode] = declared
  }
  return strictness
}

function loadFailure(error: { code?: string }): HouseholdRepositoryError {
  return new HouseholdRepositoryError(
    error.code === "42501" ? "UNAUTHORIZED" : "DEPENDENCY_UNAVAILABLE"
  )
}

function saveFailure(error: { code?: string; message?: string }): SaveHouseholdResult {
  if (error.code === "P0001" && error.message?.includes("STALE_HOUSEHOLD_VERSION") === true) {
    return { ok: false, reason: "STALE_HOUSEHOLD_VERSION" }
  }
  if (error.code === "42501") {
    return { ok: false, reason: "UNAUTHORIZED" }
  }
  if (error.code?.startsWith("23") === true || error.code === "22P02") {
    return { ok: false, reason: "INVALID_HOUSEHOLD_STATE" }
  }
  return { ok: false, reason: "DEPENDENCY_UNAVAILABLE" }
}

export function createSupabaseHouseholdRepository(
  client: SupabaseClient<Database>
): HouseholdRepository {
  return {
    async loadOwn() {
      const { data, error } = await client.from("households").select(HOUSEHOLD_SELECT).maybeSingle()
      if (error !== null) {
        throw loadFailure(error)
      }
      return data === null ? null : mapStoredHousehold(data)
    },
    async saveOwn(input, expectedVersion) {
      const { data, error } = await client.rpc("save_household_setup", {
        p_expected_version: expectedVersion as number,
        p_weekly_plan_budget_vnd: input.weeklyPlanBudgetVnd,
        p_max_elapsed_minutes: input.maxElapsedMinutes,
        p_member_groups: input.memberGroups.map((group) => ({
          memberKind: group.memberKind,
          ageBand: group.ageBand,
          memberCount: group.memberCount
        })),
        p_rule_codes: [...input.ruleCodes],
        p_allergen_strictness: { ...input.allergenStrictness }
      })
      if (error !== null) {
        return saveFailure(error)
      }
      if (data === null) {
        return { ok: false, reason: "DEPENDENCY_UNAVAILABLE" }
      }
      const parent = data as UnknownRecord
      return {
        ok: true,
        household: mapStoredHousehold({
          ...parent,
          household_member_groups: input.memberGroups.map((group) => ({
            member_kind: group.memberKind,
            age_band: group.ageBand,
            member_count: group.memberCount
          })),
          household_food_rules: input.ruleCodes.map((code) => ({
            rule_code: code,
            allergen_strictness: resolveAllergenStrictness(input.allergenStrictness, code),
            household_rule_options: { code }
          }))
        })
      }
    }
  }
}
