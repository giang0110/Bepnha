import { describe, expect, test } from "vitest"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import { resolveCatalogProductionReferences } from "./catalog-production-resolver.ts"
import { buildResolvableProductionSnapshot } from "./catalog-production-test-builder.ts"

describe("Phase 9B price region drift", () => {
  test("fails closed when vn_baseline is no longer the launch default", () => {
    const pack = buildReadyCatalogPack()
    const snapshot = buildResolvableProductionSnapshot(pack)
    const manifest = resolveCatalogProductionReferences(pack, "a".repeat(64), {
      ...snapshot,
      priceRegions: snapshot.priceRegions.map((row) =>
        row.code === "vn_baseline" ? { ...row, isLaunchDefault: false } : row
      )
    })

    expect(manifest.resolved).toBe(false)
    expect(manifest.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "REFERENCE_DRIFT",
          path: "$.references.priceRegion.vn_baseline"
        })
      ])
    )
  })
})
