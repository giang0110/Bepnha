// @vitest-environment node
import { describe, expect, test, vi } from "vitest"
import { purchasingPackFixture } from "./catalog-pack-test-builder.ts"
import { buildResolvableProductionSnapshot } from "./catalog-production-test-builder.ts"
import { resolveCatalogProductionReferences } from "./catalog-production-resolver.ts"
import { encodeJson, sha256 } from "./catalog-mutation-test-builder.ts"
import { planCatalogMutations } from "./catalog-mutation-planner.ts"
import { executeMutationPlan } from "./catalog-mutation-executor.ts"
import { createAdminHttpGateway } from "./catalog-admin-http-gateway.ts"
function fixture() {
  const pack = purchasingPackFixture()
  const bytes = encodeJson(pack)
  const snapshot = { ...buildResolvableProductionSnapshot(pack), foodQuantityPolicies: [] }
  const manifest = resolveCatalogProductionReferences(pack, sha256(bytes), snapshot)
  return {
    pack,
    bytes,
    snapshot,
    manifest,
    plan: planCatalogMutations(bytes, encodeJson(manifest))
  }
}
describe("v2 cooking and purchasing mutation authority", () => {
  test("resolves explicit policy version heads in the manifest", () => {
    const f = fixture()
    expect(f.manifest).toHaveProperty("foodQuantityPolicies")
    expect(f.manifest.foodQuantityPolicies).toHaveLength(f.pack.foodQuantityPolicies.length)
    expect(f.manifest.resolved).toBe(true)
  })
  test("requires and orders policy publication after its exact fact", () => {
    const f = fixture()
    expect(f.plan.executable).toBe(true)
    const p = f.pack.foodQuantityPolicies[0]!
    const save = f.plan.operations.find(
      (o) =>
        o.operationId ===
        `save_food_quantity_policy_draft:${p.foodCode}:${p.foodFactVersionNumber}:${p.versionNumber}`
    )
    expect(save).toMatchObject({
      kind: "save_food_quantity_policy_draft",
      dependsOn: [`publish_food_fact:${p.foodCode}:1`],
      input: { stepBaseQuantity: "1", provenance: p.provenance }
    })
    const publish = f.plan.operations.find((o) => o.kind === "publish_food_quantity_policy")
    expect(publish).toBeDefined()
    expect(f.plan.operations.indexOf(save!)).toBeLessThan(f.plan.operations.indexOf(publish!))
    const priceSave = f.plan.operations.find((o) => o.kind === "save_price_book_draft")
    const priceInput = priceSave?.input as {
      purchasingVersion: string
      prices: readonly { purchaseRule: unknown; purchaseProvenance: string }[]
    }
    expect(priceInput.purchasingVersion).toBe("purchase-v2")
    expect(
      priceInput.prices.map((p) => ({
        purchaseRule: p.purchaseRule,
        purchaseProvenance: p.purchaseProvenance
      }))
    ).toEqual(
      f.pack.priceBook.prices.map((p) => ({
        purchaseRule: p.purchaseRule,
        purchaseProvenance: p.purchaseProvenance
      }))
    )
  })
  test("rejects omitted or conflicting policy manifest targets", () => {
    const f = fixture()
    const changed = { ...f.manifest, foodQuantityPolicies: [] }
    expect(planCatalogMutations(f.bytes, encodeJson(changed)).executable).toBe(false)
  })
  test("binds policy IDs and revisions through execution and the admin gateway", async () => {
    const f = fixture()
    const fetch = vi.fn((_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as {
        action: string
        input: Record<string, unknown>
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: body.input.foodQuantityPolicyVersionId ?? "10000000-0000-4000-8000-000000000099",
            revision: 2,
            status: body.action.startsWith("publish") ? "published" : "draft"
          }),
          { status: 200 }
        )
      )
    })
    const run = createAdminHttpGateway({
      endpoint: "https://example.test/api/admin/catalog",
      accessToken: "synthetic",
      fetch
    })
    const result = await executeMutationPlan({
      plan: f.plan,
      allocateUuid: () => "10000000-0000-4000-8000-000000000001",
      runOperation: run
    })
    expect(result.ok).toBe(true)
    const requests = fetch.mock.calls.map(
      (c) => JSON.parse(c[1]?.body as string) as { action: string; input: Record<string, unknown> }
    )
    const publish = requests.find((r) => r.action === "publish_food_quantity_policy")
    expect(publish).toMatchObject({
      input: {
        foodQuantityPolicyVersionId: "10000000-0000-4000-8000-000000000001",
        expectedRevision: 2
      }
    })
  })
})

describe("policy collision checks", () => {
  test("blocks a pre-existing policy version instead of overwriting it", () => {
    const f = fixture()
    const food = f.pack.foods[0]!
    const foodId = "10000000-0000-4000-8000-000000000010"
    const factId = "10000000-0000-4000-8000-000000000011"
    const snapshot = {
      ...f.snapshot,
      foods: [
        {
          id: foodId,
          code: food.code,
          nameVi: food.nameVi,
          baseDimension: food.baseDimension,
          baseUnitId: f.snapshot.units.find((u) => u.code === food.baseUnitCode)!.id,
          status: "published" as const,
          revision: 1
        }
      ],
      foodFactVersions: [
        {
          id: factId,
          parentId: foodId,
          versionNumber: 1,
          revision: 2,
          publicationStatus: "published" as const
        }
      ],
      foodQuantityPolicies: [
        {
          id: "10000000-0000-4000-8000-000000000012",
          parentId: factId,
          versionNumber: 1,
          revision: 2,
          publicationStatus: "published" as const
        }
      ]
    }
    const manifest = resolveCatalogProductionReferences(f.pack, sha256(f.bytes), snapshot)
    expect(manifest.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "VERSION_ALREADY_EXISTS",
        path: `$.foodQuantityPolicies.${food.code}.1.1`
      })
    )
  })
})
