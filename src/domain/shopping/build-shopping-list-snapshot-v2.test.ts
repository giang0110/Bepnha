import { expect, test } from "vitest"
import { plannerCandidateV2, plannerInputV2 } from "../planner/planner-v2-test-fixture"
import {
  evaluatePlannerEligibilityV2,
  normalizePlannerInputV2,
  searchWeekV2
} from "../planner/planner-v2"
import { buildShoppingListSnapshotV2 } from "./build-shopping-list-snapshot-v2"
function fixture() {
  const n = normalizePlannerInputV2(
    plannerInputV2(Array.from({ length: 8 }, (_, i) => plannerCandidateV2(`week-${i}-v1`)))
  )
  if (!n.ok) throw new Error(n.error.code)
  const e = evaluatePlannerEligibilityV2(n.value)
  if (!e.ok) throw new Error(e.error.code)
  const r = searchWeekV2(n.value, e.value.eligible)
  if ("ok" in r) throw new Error(r.error.code)
  return { input: n.value, plan: r.plan }
}
test("sources sum actual cooking quantities and expose reviewed policy refs without fractional packs", () => {
  const { input, plan } = fixture()
  const r = buildShoppingListSnapshotV2(input, plan)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.value.version).toBe("shopping-list-v2")
  for (const line of r.value.lines) {
    expect(line.purchaseRule.mode).toBe("loose_mass")
    expect(line).not.toHaveProperty("purchasePackageCount")
    expect(line.sources.reduce((sum, s) => sum + Number(s.requiredBaseQuantity), 0)).toBe(
      Number(line.requiredBaseQuantity)
    )
    expect(line.policyRefs.length).toBeGreaterThan(0)
  }
})
test("rejects tampering with actual source quantities or a policy pin", () => {
  const { input, plan } = fixture()
  const first = plan.items[0]!
  const changed = {
    ...plan,
    items: [
      {
        ...first,
        snapshot: {
          ...first.snapshot,
          scaledIngredients: first.snapshot.scaledIngredients.map((i) => ({
            ...i,
            baseQuantity: "1"
          }))
        }
      },
      ...plan.items.slice(1)
    ]
  }
  expect(buildShoppingListSnapshotV2(input, changed)).toMatchObject({ ok: false })
  const policies = {
    ...input,
    candidates: input.candidates.map((c) => ({
      ...c,
      quantityPolicies: c.quantityPolicies.map((p) => ({ ...p, contentHash: "a".repeat(64) }))
    }))
  }
  expect(buildShoppingListSnapshotV2(policies, plan)).toMatchObject({ ok: false })
  expect(
    buildShoppingListSnapshotV2(
      { ...input, householdSetupVersion: input.householdSetupVersion + 1 },
      plan
    )
  ).toMatchObject({ ok: false })
})
