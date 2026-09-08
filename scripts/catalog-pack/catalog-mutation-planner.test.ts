import { describe, expect, test } from "vitest"

import {
  buildPlanningFixture,
  encodeJson
} from "./catalog-mutation-test-builder.ts"
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
      parseResolvedCatalogManifestBytes(
        encodeJson({ ...fixture.manifest, schemaVersion: "2" })
      )
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
            units: [{ ...firstUnit, unexpected: true }, ...fixture.manifest.references.units.slice(1)]
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
            units: [{ ...firstUnit, id: "not-a-uuid" }, ...fixture.manifest.references.units.slice(1)]
          }
        })
      )
    ).toEqual({ ok: false })
  })
})
