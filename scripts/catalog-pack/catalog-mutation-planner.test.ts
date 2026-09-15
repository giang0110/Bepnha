import { describe, expect, test } from "vitest"

import type {
  CatalogMutationDiagnosticCode,
  CatalogMutationPlanV1
} from "./catalog-mutation-types.ts"
import { planCatalogMutations } from "./catalog-mutation-planner.ts"
import { buildPlanningFixture, encodeJson } from "./catalog-mutation-test-builder.ts"
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
