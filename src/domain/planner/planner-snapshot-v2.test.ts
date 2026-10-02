import { expect, test } from "vitest"
import { normalizePlannerInputV2 } from "./planner-v2"
import { plannerInputV2 } from "./planner-v2-test-fixture"
import { buildPlannerSnapshotPayloadsV2 } from "./planner-snapshot"
import { canonicalJson } from "../shared/canonical-json"
const profile = {
  id: "10000000-0000-4000-8000-000000000001",
  memberKind: "adult" as const,
  sortOrder: 1,
  label: "Anh",
  heightCm: "170",
  weightKg: "65",
  ageYears: 30,
  sexForEquation: "male" as const,
  activityLevel: "light" as const,
  goal: "maintain" as const
}
function input() {
  const n = normalizePlannerInputV2({
    ...plannerInputV2(),
    memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 1 }],
    nutritionSetup: {
      version: "household-nutrition-v1",
      plannedMealSharePercent: 33,
      memberProfiles: [profile]
    }
  })
  if (!n.ok) throw new Error(n.error.code)
  return n.value
}
test("pins engine6, private profile estimates and physical/purchasing hashes", () => {
  const n = input()
  const r = buildPlannerSnapshotPayloadsV2({ input: n, calculation: { proof: "actual" } })
  expect(r.inputPayload).toMatchObject({
    engineVersion: "6",
    inputVersion: "planner-input-v2",
    household: {
      nutritionSetup: n.nutritionSetup,
      memberEnergyEstimates: [{ bmi: "22.491349480968858131", mealTargetKcal: "711.253125" }]
    },
    portionConfig: { version: "portion-v2" },
    energyTargetConfig: { version: "energy-target-v1" }
  })
  expect(r.catalogPayload).toMatchObject({
    candidateManifest: [
      {
        quantityPolicies: [{ contentHash: "e".repeat(64) }],
        prices: [{ purchaseTermsContentHash: "f".repeat(64) }]
      }
    ]
  })
  expect(r.calculationPayload).toEqual({ proof: "actual" })
})
test("body, policy and purchase terms changes alter private snapshot bytes", () => {
  const n = input()
  const baseline = canonicalJson(buildPlannerSnapshotPayloadsV2({ input: n, calculation: {} }))
  for (const changed of [
    {
      ...n,
      nutritionSetup: {
        ...n.nutritionSetup!,
        memberProfiles: [{ ...profile, goal: "gain" as const }]
      }
    },
    {
      ...n,
      candidates: n.candidates.map((c) => ({
        ...c,
        quantityPolicies: c.quantityPolicies.map((p) => ({ ...p, contentHash: "a".repeat(64) }))
      }))
    },
    {
      ...n,
      candidates: n.candidates.map((c) => ({
        ...c,
        prices: c.prices.map((p) => ({ ...p, purchaseTermsContentHash: "b".repeat(64) }))
      }))
    }
  ])
    expect(
      canonicalJson(buildPlannerSnapshotPayloadsV2({ input: changed, calculation: {} }))
    ).not.toBe(baseline)
})
