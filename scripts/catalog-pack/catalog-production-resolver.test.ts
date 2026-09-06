import { describe, expect, test } from "vitest"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import { resolveCatalogProductionReferences } from "./catalog-production-resolver.ts"
import { buildResolvableProductionSnapshot } from "./catalog-production-test-builder.ts"
import type { CatalogProductionSnapshot } from "./catalog-production-types.ts"

const INPUT_SHA = "a".repeat(64)

function diagnosticCodes(
  manifest: ReturnType<typeof resolveCatalogProductionReferences>
): string[] {
  return manifest.diagnostics.map((item) => item.code)
}

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

describe("resolveCatalogProductionReferences", () => {
  test("resolves launch references and canonical recipe tags", () => {
    const pack = buildReadyCatalogPack()
    const manifest = resolveCatalogProductionReferences(
      pack,
      INPUT_SHA,
      buildResolvableProductionSnapshot(pack)
    )

    expect(manifest.references.priceRegion?.code).toBe("vn_baseline")
    expect(manifest.references.recipeTags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "boil",
          productionCode: "style_boil",
          kind: "cooking_style"
        }),
        expect.objectContaining({
          code: "plant",
          productionCode: "protein_plant",
          kind: "protein_hint"
        }),
        expect.objectContaining({
          code: "main",
          productionCode: "role_main",
          kind: "dish_role"
        })
      ])
    )
    expect(diagnosticCodes(manifest)).not.toContain("REFERENCE_NOT_FOUND")
  })

  test.each([
    [
      "missing unit",
      (snapshot: CatalogProductionSnapshot) => ({
        ...snapshot,
        units: snapshot.units.filter((row) => row.code !== "g")
      }),
      "REFERENCE_NOT_FOUND"
    ],
    [
      "unit dimension drift",
      (snapshot: CatalogProductionSnapshot) => ({
        ...snapshot,
        units: snapshot.units.map((row) =>
          row.code === "g" ? { ...row, dimension: "volume" as const } : row
        )
      }),
      "REFERENCE_DRIFT"
    ],
    [
      "category ancestry drift",
      (snapshot: CatalogProductionSnapshot) => ({
        ...snapshot,
        categories: snapshot.categories.map((row) =>
          row.code === "fish" ? { ...row, parentId: null } : row
        )
      }),
      "REFERENCE_DRIFT"
    ],
    [
      "nutrient publication drift",
      (snapshot: CatalogProductionSnapshot) => ({
        ...snapshot,
        nutrients: snapshot.nutrients.map((row) =>
          row.code === "protein_g" ? { ...row, requiredForPublication: false } : row
        )
      }),
      "REFERENCE_DRIFT"
    ]
  ] as const)("fails closed on %s", (_name, mutate, expected) => {
    const pack = buildReadyCatalogPack()
    const manifest = resolveCatalogProductionReferences(
      pack,
      INPUT_SHA,
      mutate(buildResolvableProductionSnapshot(pack))
    )

    expect(diagnosticCodes(manifest)).toContain(expected)
    expect(manifest.resolved).toBe(false)
  })

  test("rejects ambiguous semantic recipe tags", () => {
    const pack = buildReadyCatalogPack()
    const snapshot = buildResolvableProductionSnapshot(pack)
    const manifest = resolveCatalogProductionReferences(pack, INPUT_SHA, {
      ...snapshot,
      recipeTags: [
        ...snapshot.recipeTags,
        {
          id: "90070000-0000-0000-0000-999999999999",
          code: "style_main",
          tagKind: "cooking_style"
        }
      ]
    })

    expect(diagnosticCodes(manifest)).toContain("REFERENCE_AMBIGUOUS")
    expect(manifest.resolved).toBe(false)
  })
})
