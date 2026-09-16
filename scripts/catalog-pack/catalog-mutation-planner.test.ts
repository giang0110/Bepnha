import { describe, expect, test } from "vitest"

import type {
  CatalogMutationDiagnosticCode,
  CatalogMutationPlanOperationV1,
  CatalogMutationPlanV1
} from "./catalog-mutation-types.ts"
import { planCatalogMutations } from "./catalog-mutation-planner.ts"
import { buildPlanningFixture, encodeJson, sha256 } from "./catalog-mutation-test-builder.ts"
import { resolveCatalogProductionReferences } from "./catalog-production-resolver.ts"
import { buildResolvableProductionSnapshot } from "./catalog-production-test-builder.ts"
import { parseResolvedCatalogManifestBytes } from "./catalog-mutation-manifest-parser.ts"

describe("parseResolvedCatalogManifestBytes", () => {
  test("accepts a Phase 9B manifest built from the ready Phase 9A fixture", () => {
    const fixture = buildPlanningFixture()

    expect(parseResolvedCatalogManifestBytes(fixture.manifestBytes)).toEqual({
      ok: true,
      manifest: fixture.manifest
    })
  })

  test("rejects an unknown top-level key", () => {
    const fixture = buildPlanningFixture()

    expect(
      parseResolvedCatalogManifestBytes(
        encodeJson({ ...fixture.manifest, productionOverride: true })
      )
    ).toEqual({ ok: false })
  })

  test("rejects an unsupported schema version", () => {
    const fixture = buildPlanningFixture()

    expect(
      parseResolvedCatalogManifestBytes(encodeJson({ ...fixture.manifest, schemaVersion: "2" }))
    ).toEqual({ ok: false })
  })

  test("rejects malformed UTF-8 and malformed JSON", () => {
    expect(parseResolvedCatalogManifestBytes(new Uint8Array([0xc3, 0x28]))).toEqual({
      ok: false
    })
    expect(parseResolvedCatalogManifestBytes(new TextEncoder().encode("{"))).toEqual({
      ok: false
    })
  })

  test("rejects unknown nested keys", () => {
    const fixture = buildPlanningFixture()
    const firstUnit = fixture.manifest.references.units[0]
    if (firstUnit === undefined) throw new Error("Fixture must include a unit reference")

    expect(
      parseResolvedCatalogManifestBytes(
        encodeJson({
          ...fixture.manifest,
          references: {
            ...fixture.manifest.references,
            units: [
              { ...firstUnit, unexpected: true },
              ...fixture.manifest.references.units.slice(1)
            ]
          }
        })
      )
    ).toEqual({ ok: false })
  })

  test("rejects invalid identity and status enum values", () => {
    const fixture = buildPlanningFixture()
    const firstFood = fixture.manifest.foods[0]
    if (firstFood === undefined) throw new Error("Fixture must include a food target")

    expect(
      parseResolvedCatalogManifestBytes(
        encodeJson({
          ...fixture.manifest,
          foods: [
            {
              ...firstFood,
              identity: { ...firstFood.identity, state: "future" }
            },
            ...fixture.manifest.foods.slice(1)
          ]
        })
      )
    ).toEqual({ ok: false })

    expect(
      parseResolvedCatalogManifestBytes(
        encodeJson({
          ...fixture.manifest,
          foods: [
            {
              ...firstFood,
              identity: { ...firstFood.identity, status: "archived" }
            },
            ...fixture.manifest.foods.slice(1)
          ]
        })
      )
    ).toEqual({ ok: false })
  })

  test("rejects invalid SHA-256 fields", () => {
    const fixture = buildPlanningFixture()

    expect(
      parseResolvedCatalogManifestBytes(
        encodeJson({ ...fixture.manifest, inputSha256: "not-a-sha" })
      )
    ).toEqual({ ok: false })
    expect(
      parseResolvedCatalogManifestBytes(
        encodeJson({ ...fixture.manifest, productionSnapshotSha256: "not-a-sha" })
      )
    ).toEqual({ ok: false })
  })

  test("rejects malformed UUID-shaped production IDs", () => {
    const fixture = buildPlanningFixture()
    const firstUnit = fixture.manifest.references.units[0]
    if (firstUnit === undefined) throw new Error("Fixture must include a unit reference")

    expect(
      parseResolvedCatalogManifestBytes(
        encodeJson({
          ...fixture.manifest,
          references: {
            ...fixture.manifest.references,
            units: [
              { ...firstUnit, id: "not-a-uuid" },
              ...fixture.manifest.references.units.slice(1)
            ]
          }
        })
      )
    ).toEqual({ ok: false })
  })
})

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

function expectFailure(plan: CatalogMutationPlanV1, code: CatalogMutationDiagnosticCode): void {
  expect(plan.executable).toBe(false)
  expect(plan.operations).toEqual([])
  expect(plan.bindings).toEqual([])
  expect(plan.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([code])
}

describe("planCatalogMutations integrity gates", () => {
  test("fails closed when Phase 9A input is invalid", () => {
    const fixture = buildPlanningFixture()
    const invalidPackBytes = encodeJson({ ...fixture.pack, catalogCode: "Launch" })

    expectFailure(planCatalogMutations(invalidPackBytes, fixture.manifestBytes), "PHASE_9A_INVALID")
  })

  test("fails closed when Phase 9A input is valid but not ready", () => {
    const fixture = buildPlanningFixture()
    const notReadyPackBytes = encodeJson({
      ...fixture.pack,
      mealOptions: fixture.pack.mealOptions.slice(0, 20)
    })

    expectFailure(
      planCatalogMutations(notReadyPackBytes, fixture.manifestBytes),
      "PHASE_9A_NOT_READY"
    )
  })

  test("rejects a malformed Phase 9B manifest", () => {
    const fixture = buildPlanningFixture()

    expectFailure(
      planCatalogMutations(fixture.packBytes, new TextEncoder().encode("{")),
      "MANIFEST_INVALID"
    )
  })

  test("rejects unresolved manifests and manifests carrying diagnostics", () => {
    const fixture = buildPlanningFixture()

    expectFailure(
      planCatalogMutations(fixture.packBytes, encodeJson({ ...fixture.manifest, resolved: false })),
      "MANIFEST_NOT_RESOLVED"
    )

    expectFailure(
      planCatalogMutations(
        fixture.packBytes,
        encodeJson({
          ...fixture.manifest,
          diagnostics: [
            {
              severity: "error",
              code: "REFERENCE_NOT_FOUND",
              path: "references.units.g",
              message: "Synthetic unresolved reference"
            }
          ]
        })
      ),
      "MANIFEST_NOT_RESOLVED"
    )
  })

  test("rejects an exact pack SHA mismatch", () => {
    const fixture = buildPlanningFixture()

    expectFailure(
      planCatalogMutations(
        fixture.packBytes,
        encodeJson({ ...fixture.manifest, inputSha256: "a".repeat(64) })
      ),
      "INPUT_SHA_MISMATCH"
    )
  })

  test("rejects a catalog code mismatch", () => {
    const fixture = buildPlanningFixture()

    expectFailure(
      planCatalogMutations(
        fixture.packBytes,
        encodeJson({ ...fixture.manifest, catalogCode: "launch_other" })
      ),
      "CATALOG_CODE_MISMATCH"
    )
  })

  test("rejects a missing required resolved reference", () => {
    const fixture = buildPlanningFixture()

    expectFailure(
      planCatalogMutations(
        fixture.packBytes,
        encodeJson({
          ...fixture.manifest,
          references: {
            ...fixture.manifest.references,
            units: fixture.manifest.references.units.filter((reference) => reference.code !== "g")
          }
        })
      ),
      "REFERENCE_MISSING"
    )
  })

  test("rejects conflicting identities", () => {
    const fixture = buildPlanningFixture()
    const firstFood = fixture.manifest.foods[0]
    if (firstFood === undefined) throw new Error("Fixture must include a food target")

    expectFailure(
      planCatalogMutations(
        fixture.packBytes,
        encodeJson({
          ...fixture.manifest,
          foods: [
            {
              ...firstFood,
              identity: { ...firstFood.identity, state: "conflict" }
            },
            ...fixture.manifest.foods.slice(1)
          ]
        })
      ),
      "IDENTITY_STATE_INVALID"
    )
  })

  test("rejects version collisions", () => {
    const fixture = buildPlanningFixture()
    const firstFood = fixture.manifest.foods[0]
    if (firstFood === undefined) throw new Error("Fixture must include a food target")

    expectFailure(
      planCatalogMutations(
        fixture.packBytes,
        encodeJson({
          ...fixture.manifest,
          foods: [
            {
              ...firstFood,
              version: { ...firstFood.version, state: "collision" }
            },
            ...fixture.manifest.foods.slice(1)
          ]
        })
      ),
      "VERSION_STATE_INVALID"
    )
  })

  test("rejects missing and duplicate manifest targets", () => {
    const fixture = buildPlanningFixture()
    const firstFood = fixture.manifest.foods[0]
    if (firstFood === undefined) throw new Error("Fixture must include a food target")

    expectFailure(
      planCatalogMutations(
        fixture.packBytes,
        encodeJson({
          ...fixture.manifest,
          foods: fixture.manifest.foods.filter((target) => target.code !== firstFood.code)
        })
      ),
      "MANIFEST_TARGET_MISSING"
    )

    expectFailure(
      planCatalogMutations(
        fixture.packBytes,
        encodeJson({
          ...fixture.manifest,
          foods: [...fixture.manifest.foods, firstFood]
        })
      ),
      "MANIFEST_TARGET_DUPLICATE"
    )
  })

  test("rejects a requested target version mismatch", () => {
    const fixture = buildPlanningFixture()
    const firstFood = fixture.manifest.foods[0]
    if (firstFood === undefined) throw new Error("Fixture must include a food target")

    expectFailure(
      planCatalogMutations(
        fixture.packBytes,
        encodeJson({
          ...fixture.manifest,
          foods: [
            { ...firstFood, requestedVersionNumber: firstFood.requestedVersionNumber + 1 },
            ...fixture.manifest.foods.slice(1)
          ]
        })
      ),
      "VERSION_STATE_INVALID"
    )
  })
})

describe("planCatalogMutations symbolic bindings", () => {
  test("uses operation output and allocate_uuid bindings for missing food targets", () => {
    const fixture = buildPlanningFixture()
    const plan = planCatalogMutations(fixture.packBytes, fixture.manifestBytes)

    expect(plan.bindings).toContainEqual({
      handle: "identity:food:test_tofu",
      source: {
        kind: "operation_output",
        operationId: "create_food:test_tofu",
        field: "id"
      }
    })
    expect(plan.bindings).toContainEqual({
      handle: "version:food_fact:test_tofu:1",
      source: { kind: "allocate_uuid" }
    })
  })

  test("uses the resolved UUID binding for an existing compatible food identity", () => {
    const fixture = buildPlanningFixture()
    const firstFood = fixture.manifest.foods.find((food) => food.code === "test_tofu")
    if (firstFood === undefined) throw new Error("Fixture must include a food target")
    const existingFoodId = "9abc0000-0000-0000-0000-000000000001"
    const manifestBytes = encodeJson({
      ...fixture.manifest,
      foods: fixture.manifest.foods.map((food) =>
        food.code === firstFood.code
          ? {
              ...food,
              identity: {
                state: "existing",
                id: existingFoodId,
                revision: 1,
                status: "published"
              },
              version: {
                state: "missing",
                id: null,
                revision: null,
                publicationStatus: null
              }
            }
          : food
      )
    })

    const plan = planCatalogMutations(fixture.packBytes, manifestBytes)

    expect(plan.bindings).toContainEqual({
      handle: "identity:food:test_tofu",
      source: { kind: "resolved_uuid", id: existingFoodId }
    })
  })

  test("never uses UUID-shaped symbolic handles", () => {
    const fixture = buildPlanningFixture()
    const plan = planCatalogMutations(fixture.packBytes, fixture.manifestBytes)

    expect(plan.bindings.length).toBeGreaterThan(0)
    expect(plan.bindings.every((binding) => !UUID_SHAPE.test(binding.handle))).toBe(true)
  })
})

function byId(plan: CatalogMutationPlanV1, operationId: string) {
  return plan.operations.find((operation) => operation.operationId === operationId)
}

const binding = (handle: string): { readonly $binding: string } => ({ $binding: handle })
const revisionOutput = (operationId: string) => ({
  $operationOutput: { operationId, field: "revision" as const }
})

describe("planCatalogMutations command templates", () => {
  test("builds exact food create/save/publish templates", () => {
    const fixture = buildPlanningFixture()
    const food = fixture.pack.foods.find((item) => item.code === "test_tofu")
    if (food === undefined) throw new Error("Fixture must include test_tofu")
    const plan = planCatalogMutations(fixture.packBytes, fixture.manifestBytes)

    expect(byId(plan, "create_food:test_tofu")).toMatchObject({
      kind: "create_food",
      input: {
        code: "test_tofu",
        nameVi: "Đậu hũ kiểm thử",
        baseDimension: "mass",
        baseUnitId: binding("reference:unit:g")
      }
    })
    expect(byId(plan, "save_food_fact_draft:test_tofu:1")?.input).toEqual({
      foodFactVersionId: binding("version:food_fact:test_tofu:1"),
      expectedRevision: 1,
      foodId: binding("identity:food:test_tofu"),
      versionNumber: food.fact.versionNumber,
      categoryId: binding("reference:category:tofu"),
      edibleFraction: food.fact.edibleFraction,
      provenance: food.fact.provenance,
      allergenAssessments: food.fact.allergenAssessments,
      nutrients: food.fact.nutrients,
      categoryAncestry: food.fact.categoryAncestry,
      dietaryTagCodes: food.fact.dietaryTagCodes,
      conversions: food.fact.conversions.map((conversion) => ({
        unitId: binding(`reference:unit:${conversion.unitCode}`),
        baseQuantityPerUnit: conversion.baseQuantityPerUnit,
        grossGramsPerUnit: conversion.grossGramsPerUnit,
        displayStep: conversion.displayStep,
        provenance: conversion.provenance
      }))
    })
    expect(byId(plan, "publish_food_fact:test_tofu:1")?.input).toEqual({
      foodFactVersionId: binding("version:food_fact:test_tofu:1"),
      expectedRevision: revisionOutput("save_food_fact_draft:test_tofu:1")
    })
  })

  test("builds exact recipe templates and skips create for an existing identity", () => {
    const fixture = buildPlanningFixture()
    const recipe = fixture.pack.recipes.find((item) => item.code === "test_tofu_recipe")
    if (recipe === undefined) throw new Error("Fixture must include test_tofu_recipe")
    const plan = planCatalogMutations(fixture.packBytes, fixture.manifestBytes)
    const ingredient = recipe.version.ingredients[0]
    if (ingredient === undefined) throw new Error("Fixture recipe must include one ingredient")
    const ingredientId = `ingredient:${recipe.code}:${ingredient.ingredientCode}`

    expect(byId(plan, "create_recipe:test_tofu_recipe")?.input).toEqual({
      code: recipe.code,
      nameVi: recipe.nameVi
    })
    expect(byId(plan, "save_recipe_version_draft:test_tofu_recipe:1")?.input).toEqual({
      recipeVersionId: binding("version:recipe:test_tofu_recipe:1"),
      expectedRevision: 1,
      recipeId: binding("identity:recipe:test_tofu_recipe"),
      versionNumber: recipe.version.versionNumber,
      yieldAdultEquivalent: recipe.version.yieldAdultEquivalent,
      activeMinutes: recipe.version.activeMinutes,
      elapsedMinutes: recipe.version.elapsedMinutes,
      ingredients: [
        {
          recipeIngredientId: ingredientId,
          foodId: binding("identity:food:test_tofu"),
          foodFactVersionId: binding("version:food_fact:test_tofu:1"),
          quantity: ingredient.quantity,
          unitId: binding("reference:unit:g"),
          preparationNoteVi: ingredient.preparationNoteVi,
          order: ingredient.order
        }
      ],
      steps: recipe.version.steps.map((step) => ({
        order: step.order,
        instructionVi: step.instructionVi,
        timerMinutes: step.timerMinutes,
        ingredientIds: step.ingredientCodes.map((code) => `ingredient:${recipe.code}:${code}`)
      })),
      tagIds: [binding("reference:recipe_tag:dish_role:main")]
    })
    expect(byId(plan, "publish_recipe:test_tofu_recipe:1")?.input).toEqual({
      recipeVersionId: binding("version:recipe:test_tofu_recipe:1"),
      expectedRevision: revisionOutput("save_recipe_version_draft:test_tofu_recipe:1")
    })

    const target = fixture.manifest.recipes.find((item) => item.code === recipe.code)
    if (target === undefined) throw new Error("Fixture manifest must include recipe target")
    const existingRecipeId = "9abc0000-0000-0000-0000-000000000002"
    const existingManifestBytes = encodeJson({
      ...fixture.manifest,
      recipes: fixture.manifest.recipes.map((item) =>
        item.code === recipe.code
          ? {
              ...target,
              identity: {
                state: "existing",
                id: existingRecipeId,
                revision: 1,
                status: "published"
              },
              version: {
                state: "missing",
                id: null,
                revision: null,
                publicationStatus: null
              }
            }
          : item
      )
    })
    const existingPlan = planCatalogMutations(fixture.packBytes, existingManifestBytes)
    expect(byId(existingPlan, "create_recipe:test_tofu_recipe")).toBeUndefined()
    expect(existingPlan.bindings).toContainEqual({
      handle: "identity:recipe:test_tofu_recipe",
      source: { kind: "resolved_uuid", id: existingRecipeId }
    })
    expect(byId(existingPlan, "save_recipe_version_draft:test_tofu_recipe:1")?.input).toMatchObject(
      {
        recipeId: binding("identity:recipe:test_tofu_recipe")
      }
    )
  })

  test("builds exact price-book templates", () => {
    const fixture = buildPlanningFixture()
    const priceBook = fixture.pack.priceBook
    const plan = planCatalogMutations(fixture.packBytes, fixture.manifestBytes)

    expect(byId(plan, "create_price_book:vn_baseline:1")?.input).toEqual({
      regionId: binding("reference:price_region:vn_baseline"),
      versionNumber: 1,
      effectiveFrom: priceBook.effectiveFrom,
      effectiveTo: priceBook.effectiveTo
    })
    expect(byId(plan, "save_price_book_draft:vn_baseline:1")?.input).toEqual({
      priceBookId: binding("identity:price_book:vn_baseline:1"),
      expectedRevision: revisionOutput("create_price_book:vn_baseline:1"),
      effectiveFrom: priceBook.effectiveFrom,
      effectiveTo: priceBook.effectiveTo,
      prices: [...priceBook.prices]
        .sort((left, right) =>
          left.foodCode < right.foodCode ? -1 : left.foodCode > right.foodCode ? 1 : 0
        )
        .map((price) => ({
          foodPriceId: `price:vn_baseline:1:${price.foodCode}`,
          foodId: binding(`identity:food:${price.foodCode}`),
          foodFactVersionId: binding(
            `version:food_fact:${price.foodCode}:${price.foodFactVersionNumber}`
          ),
          packageQuantity: price.packageQuantity,
          packageUnitId: binding(`reference:unit:${price.packageUnitCode}`),
          packageBaseQuantity: price.packageBaseQuantity,
          baseUnitId: binding(`reference:unit:${price.baseUnitCode}`),
          packagePriceVnd: price.packagePriceVnd,
          purchaseIncrement: price.purchaseIncrement,
          observedAt: price.observedAt,
          sourceReference: price.sourceReference
        }))
    })
    expect(byId(plan, "publish_price_book:vn_baseline:1")?.input).toEqual({
      priceBookId: binding("identity:price_book:vn_baseline:1"),
      expectedRevision: revisionOutput("save_price_book_draft:vn_baseline:1")
    })
  })

  test("builds exact meal-option templates with canonical tag bindings", () => {
    const fixture = buildPlanningFixture()
    const meal = fixture.pack.mealOptions.find((item) => item.code === "test_meal_01")
    if (meal === undefined) throw new Error("Fixture must include test_meal_01")
    const plan = planCatalogMutations(fixture.packBytes, fixture.manifestBytes)

    expect(byId(plan, "create_meal_option:test_meal_01")?.input).toEqual({
      code: meal.code,
      nameVi: meal.nameVi
    })
    expect(byId(plan, "save_meal_option_version_draft:test_meal_01:1")?.input).toEqual({
      mealOptionVersionId: binding("version:meal_option:test_meal_01:1"),
      mealOptionId: binding("identity:meal_option:test_meal_01"),
      expectedRevision: 1,
      versionNumber: meal.version.versionNumber,
      yieldAdultEquivalent: meal.version.yieldAdultEquivalent,
      activeMinutes: meal.version.activeMinutes,
      elapsedMinutes: meal.version.elapsedMinutes,
      components: meal.version.components.map((component) => ({
        recipeId: binding(`identity:recipe:${component.recipeCode}`),
        recipeVersionId: binding(
          `version:recipe:${component.recipeCode}:${component.recipeVersionNumber}`
        ),
        quantityMultiplier: component.quantityMultiplier,
        mealRole: component.mealRole,
        order: component.order
      })),
      tagIds: [
        binding("reference:recipe_tag:cooking_style:boil"),
        binding("reference:recipe_tag:dish_role:main"),
        binding("reference:recipe_tag:protein_hint:plant")
      ]
    })
    expect(byId(plan, "publish_meal_option:test_meal_01:1")?.input).toEqual({
      mealOptionVersionId: binding("version:meal_option:test_meal_01:1"),
      expectedRevision: revisionOutput("save_meal_option_version_draft:test_meal_01:1")
    })
  })
})

describe("planCatalogMutations dependency DAG and canonical order", () => {
  test("emits dependency-safe operations in fixed bucket order", () => {
    const fixture = buildPlanningFixture()
    const plan = planCatalogMutations(fixture.packBytes, fixture.manifestBytes)

    expect(byId(plan, "save_food_fact_draft:test_tofu:1")?.dependsOn).toEqual([
      "create_food:test_tofu"
    ])
    expect(byId(plan, "publish_food_fact:test_tofu:1")?.dependsOn).toEqual([
      "save_food_fact_draft:test_tofu:1"
    ])
    expect(byId(plan, "save_recipe_version_draft:test_tofu_recipe:1")?.dependsOn).toEqual([
      "create_recipe:test_tofu_recipe",
      "publish_food_fact:test_tofu:1"
    ])
    expect(byId(plan, "save_price_book_draft:vn_baseline:1")?.dependsOn).toEqual([
      "create_price_book:vn_baseline:1",
      "publish_food_fact:test_chicken:1",
      "publish_food_fact:test_fish:1",
      "publish_food_fact:test_tofu:1"
    ])
    expect(byId(plan, "save_meal_option_version_draft:test_meal_01:1")?.dependsOn).toEqual([
      "create_meal_option:test_meal_01",
      "publish_recipe:test_tofu_recipe:1"
    ])

    const indexById = new Map(
      plan.operations.map((operation, index) => [operation.operationId, index])
    )
    for (const operation of plan.operations) {
      for (const dependency of operation.dependsOn) {
        expect(indexById.get(dependency)).toBeLessThan(indexById.get(operation.operationId) ?? -1)
      }
    }

    const rank = {
      create_food: 1,
      save_food_fact_draft: 2,
      publish_food_fact: 3,
      create_recipe: 4,
      save_recipe_version_draft: 5,
      publish_recipe: 6,
      create_price_book: 7,
      save_price_book_draft: 8,
      publish_price_book: 9,
      create_meal_option: 10,
      save_meal_option_version_draft: 11,
      publish_meal_option: 12
    } as const
    const ranks = plan.operations.map((operation) => rank[operation.kind])
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right))
  })

  test("reports missing dependencies and cycles from the ordering helper", async () => {
    type OrderResult =
      | { readonly ok: true; readonly operations: readonly CatalogMutationPlanOperationV1[] }
      | { readonly ok: false; readonly code: "DEPENDENCY_MISSING" | "DEPENDENCY_CYCLE" }
    type Orderer = (operations: readonly CatalogMutationPlanOperationV1[]) => OrderResult
    const module = await import("./catalog-mutation-planner.ts")
    const orderer = (module as unknown as { readonly orderMutationOperations?: Orderer })
      .orderMutationOperations
    expect(orderer).toBeTypeOf("function")
    if (orderer === undefined) return

    const operation = (
      operationId: string,
      dependsOn: readonly string[]
    ): CatalogMutationPlanOperationV1 => ({
      operationId,
      kind: "create_food",
      logicalKey: operationId,
      dependsOn,
      input: {},
      outputs: []
    })

    expect(orderer([operation("a", ["missing"])])).toEqual({
      ok: false,
      code: "DEPENDENCY_MISSING"
    })
    expect(orderer([operation("a", ["b"]), operation("b", ["a"])])).toEqual({
      ok: false,
      code: "DEPENDENCY_CYCLE"
    })
  })
})

describe("planCatalogMutations determinism", () => {
  test("is byte-equivalent for exact inputs and preserves provenance hashes", () => {
    const fixture = buildPlanningFixture()
    const first = planCatalogMutations(fixture.packBytes, fixture.manifestBytes)
    const second = planCatalogMutations(fixture.packBytes, fixture.manifestBytes)

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first).toMatchObject({
      schemaVersion: "1",
      catalogCode: fixture.pack.catalogCode,
      inputSha256: fixture.inputSha256,
      resolvedManifestSha256: sha256(fixture.manifestBytes),
      productionSnapshotSha256: fixture.manifest.productionSnapshotSha256,
      executable: true,
      diagnostics: []
    })
  })

  test("canonicalizes semantically equivalent top-level source ordering", () => {
    const fixture = buildPlanningFixture()
    const shuffledPack = {
      ...fixture.pack,
      foods: [...fixture.pack.foods].reverse(),
      recipes: [...fixture.pack.recipes].reverse(),
      priceBook: {
        ...fixture.pack.priceBook,
        prices: [...fixture.pack.priceBook.prices].reverse()
      },
      mealOptions: [...fixture.pack.mealOptions].reverse()
    }
    const shuffledPackBytes = encodeJson(shuffledPack)
    const shuffledManifest = resolveCatalogProductionReferences(
      shuffledPack,
      sha256(shuffledPackBytes),
      buildResolvableProductionSnapshot(fixture.pack)
    )
    const shuffledPlan = planCatalogMutations(shuffledPackBytes, encodeJson(shuffledManifest))
    const baseline = planCatalogMutations(fixture.packBytes, fixture.manifestBytes)

    expect(shuffledPlan.operations).toEqual(baseline.operations)
    expect(shuffledPlan.bindings).toEqual(baseline.bindings)
  })
})
