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

function requiredRow<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing test row: ${label}`)
  return value
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

    expect(manifest.resolved).toBe(true)
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

  test("missing identities keep null IDs without blocking resolution", () => {
    const pack = buildReadyCatalogPack()
    const manifest = resolveCatalogProductionReferences(
      pack,
      INPUT_SHA,
      buildResolvableProductionSnapshot(pack)
    )

    expect(manifest.foods[0]?.identity).toMatchObject({ state: "missing", id: null })
    expect(manifest.foods[0]?.version).toMatchObject({
      state: "pending_parent_creation",
      id: null
    })
    expect(diagnosticCodes(manifest)).not.toContain("IDENTITY_CONFLICT")
  })

  test("compatible existing food identity with unused version remains resolvable", () => {
    const pack = buildReadyCatalogPack()
    const snapshot = buildResolvableProductionSnapshot(pack)
    const g = requiredRow(
      snapshot.units.find((row) => row.code === "g"),
      "unit g"
    )
    const manifest = resolveCatalogProductionReferences(pack, INPUT_SHA, {
      ...snapshot,
      foods: [
        {
          id: "91000000-0000-0000-0000-000000000001",
          code: "test_tofu",
          nameVi: "Đậu hũ kiểm thử",
          baseDimension: "mass",
          baseUnitId: g.id,
          status: "draft",
          revision: 1
        }
      ]
    })
    const tofu = requiredRow(
      manifest.foods.find((item) => item.code === "test_tofu"),
      "resolved tofu"
    )

    expect(tofu.identity).toMatchObject({
      state: "existing",
      id: "91000000-0000-0000-0000-000000000001"
    })
    expect(tofu.version).toMatchObject({ state: "missing", id: null })
    expect(manifest.resolved).toBe(true)
  })

  test("existing requested food version blocks handoff", () => {
    const pack = buildReadyCatalogPack()
    const snapshot = buildResolvableProductionSnapshot(pack)
    const g = requiredRow(
      snapshot.units.find((row) => row.code === "g"),
      "unit g"
    )
    const foodId = "91000000-0000-0000-0000-000000000001"
    const manifest = resolveCatalogProductionReferences(pack, INPUT_SHA, {
      ...snapshot,
      foods: [
        {
          id: foodId,
          code: "test_tofu",
          nameVi: "Đậu hũ kiểm thử",
          baseDimension: "mass",
          baseUnitId: g.id,
          status: "draft",
          revision: 1
        }
      ],
      foodFactVersions: [
        {
          id: "91100000-0000-0000-0000-000000000001",
          parentId: foodId,
          versionNumber: 1,
          revision: 2,
          publicationStatus: "draft"
        }
      ]
    })
    const tofu = requiredRow(
      manifest.foods.find((item) => item.code === "test_tofu"),
      "resolved tofu"
    )

    expect(tofu.version.state).toBe("collision")
    expect(diagnosticCodes(manifest)).toContain("VERSION_ALREADY_EXISTS")
    expect(manifest.resolved).toBe(false)
  })

  test.each([
    ["renamed", "Đậu hũ sai tên", "draft" as const],
    ["retired", "Đậu hũ kiểm thử", "retired" as const]
  ])("existing food identity %s is a conflict", (_name, nameVi, status) => {
    const pack = buildReadyCatalogPack()
    const snapshot = buildResolvableProductionSnapshot(pack)
    const g = requiredRow(
      snapshot.units.find((row) => row.code === "g"),
      "unit g"
    )
    const manifest = resolveCatalogProductionReferences(pack, INPUT_SHA, {
      ...snapshot,
      foods: [
        {
          id: "91000000-0000-0000-0000-000000000001",
          code: "test_tofu",
          nameVi,
          baseDimension: "mass",
          baseUnitId: g.id,
          status,
          revision: 1
        }
      ]
    })
    const tofu = requiredRow(
      manifest.foods.find((item) => item.code === "test_tofu"),
      "resolved tofu"
    )

    expect(tofu.identity.state).toBe("conflict")
    expect(diagnosticCodes(manifest)).toContain("IDENTITY_CONFLICT")
    expect(manifest.resolved).toBe(false)
  })

  test("existing requested recipe version blocks handoff", () => {
    const pack = buildReadyCatalogPack()
    const snapshot = buildResolvableProductionSnapshot(pack)
    const recipeId = "92000000-0000-0000-0000-000000000001"
    const manifest = resolveCatalogProductionReferences(pack, INPUT_SHA, {
      ...snapshot,
      recipes: [
        {
          id: recipeId,
          code: "test_tofu_recipe",
          nameVi: "Món đậu hũ kiểm thử",
          status: "draft",
          revision: 1
        }
      ],
      recipeVersions: [
        {
          id: "92100000-0000-0000-0000-000000000001",
          parentId: recipeId,
          versionNumber: 1,
          revision: 1,
          publicationStatus: "published"
        }
      ]
    })
    const recipe = requiredRow(
      manifest.recipes.find((item) => item.code === "test_tofu_recipe"),
      "resolved recipe"
    )

    expect(recipe.version.state).toBe("collision")
    expect(diagnosticCodes(manifest)).toContain("VERSION_ALREADY_EXISTS")
    expect(manifest.resolved).toBe(false)
  })

  test("existing requested meal-option version blocks handoff", () => {
    const pack = buildReadyCatalogPack()
    const snapshot = buildResolvableProductionSnapshot(pack)
    const mealId = "93000000-0000-0000-0000-000000000001"
    const manifest = resolveCatalogProductionReferences(pack, INPUT_SHA, {
      ...snapshot,
      mealOptions: [
        {
          id: mealId,
          code: "test_meal_01",
          nameVi: "Bữa kiểm thử 1",
          status: "published",
          revision: 3
        }
      ],
      mealOptionVersions: [
        {
          id: "93100000-0000-0000-0000-000000000001",
          parentId: mealId,
          versionNumber: 1,
          revision: 4,
          publicationStatus: "published"
        }
      ]
    })
    const meal = requiredRow(
      manifest.mealOptions.find((item) => item.code === "test_meal_01"),
      "resolved meal option"
    )

    expect(meal.version.state).toBe("collision")
    expect(diagnosticCodes(manifest)).toContain("VERSION_ALREADY_EXISTS")
    expect(manifest.resolved).toBe(false)
  })

  test("existing requested vn_baseline price-book version blocks handoff", () => {
    const pack = buildReadyCatalogPack()
    const snapshot = buildResolvableProductionSnapshot(pack)
    const region = requiredRow(
      snapshot.priceRegions.find((row) => row.code === "vn_baseline"),
      "vn_baseline region"
    )
    const manifest = resolveCatalogProductionReferences(pack, INPUT_SHA, {
      ...snapshot,
      priceBooks: [
        {
          id: "94000000-0000-0000-0000-000000000001",
          regionId: region.id,
          versionNumber: 1,
          revision: 2,
          publicationStatus: "draft"
        }
      ]
    })

    expect(manifest.priceBook?.version.state).toBe("collision")
    expect(diagnosticCodes(manifest)).toContain("VERSION_ALREADY_EXISTS")
    expect(manifest.resolved).toBe(false)
  })

  test("same logical snapshot hashes identically regardless of database row order", () => {
    const pack = buildReadyCatalogPack()
    const first = buildResolvableProductionSnapshot(pack)
    const reversed = Object.fromEntries(
      Object.entries(first).map(([key, value]) => [
        key,
        Array.isArray(value) ? [...value].reverse() : value
      ])
    ) as unknown as CatalogProductionSnapshot

    const a = resolveCatalogProductionReferences(pack, INPUT_SHA, first)
    const b = resolveCatalogProductionReferences(pack, INPUT_SHA, reversed)

    expect(a.productionSnapshotSha256).toBe(b.productionSnapshotSha256)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
