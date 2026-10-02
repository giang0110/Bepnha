import { expect, test } from "vitest"
import {
  createMemberProfileDraft,
  householdFormReducer,
  householdFormStateFromSetup,
  INITIAL_HOUSEHOLD_FORM_STATE,
  nutritionSetupFromForm
} from "./household-form-state"
const ids = [1, 2, 3].map((n) => `10000000-0000-4000-8000-00000000000${n}`)
test("removing the middle member preserves identity and measurements", () => {
  let state = INITIAL_HOUSEHOLD_FORM_STATE
  for (const [i, id] of ids.entries())
    state = householdFormReducer(state, {
      type: "add-member-profile",
      profile: { ...createMemberProfileDraft("adult", id, i + 1), weightInput: String(60 + i) }
    })
  state = householdFormReducer(state, { type: "remove-member-profile", id: ids[1]! })
  expect(state.memberProfiles.map((p) => [p.id, p.weightInput])).toEqual([
    [ids[0], "60"],
    [ids[2], "62"]
  ])
  expect(state.memberCounts.adult).toBe(2)
  expect(nutritionSetupFromForm(state)).toMatchObject({
    ok: true,
    value: { plannedMealSharePercent: 33 }
  })
})
test("legacy counts create blank private drafts without guessed body inputs", () => {
  let i = 0
  const state = householdFormStateFromSetup(
    {
      householdId: "hh",
      version: 1,
      onboardingCompletedAt: "2026-01-01",
      memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
      weeklyPlanBudgetVnd: 700000,
      maxElapsedMinutes: 30,
      ruleCodes: [],
      allergenStrictness: {}
    },
    () => ids[i++]!
  )
  expect(state.memberProfiles).toHaveLength(2)
  for (const p of state.memberProfiles)
    expect(p).toMatchObject({
      heightInput: "",
      weightInput: "",
      ageInput: "",
      sexForEquation: null,
      activityLevel: null,
      goal: "maintain"
    })
})
test.each(["19", "51", "33.5", ""])(
  "rejects invalid meal share %s without altering draft",
  (share) => {
    const state = { ...INITIAL_HOUSEHOLD_FORM_STATE, mealEnergyShareInput: share }
    expect(nutritionSetupFromForm(state).ok).toBe(false)
    expect(state.mealEnergyShareInput).toBe(share)
  }
)
