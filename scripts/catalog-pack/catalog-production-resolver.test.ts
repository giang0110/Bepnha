import { describe, expect, test } from "vitest"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import { buildResolvableProductionSnapshot } from "./catalog-production-test-builder.ts"
import type { CatalogProductionSnapshot } from "./catalog-production-types.ts"

describe("Phase 9B production snapshot contracts", () => {
  test("synthetic snapshot contains all whitelisted catalog domains", () => {
    const pack = buildReadyCatalogPack()
    const snapshot: CatalogProductionSnapshot = buildResolvableProductionSnapshot(pack)

    expect(snapshot.units.length).toBeGreaterThan(0)
    expect(snapshot.categories.length).toBeGreaterThan(0)
    expect(snapshot.allergens).toHaveLength(10)
    expect(snapshot.nutrients).toHaveLength(6)
    expect(snapshot.priceRegions.some((row) => row.code === "vn_baseline")).toBe(true)
    expect(snapshot.recipeTags.length).toBeGreaterThan(0)
  })
})
