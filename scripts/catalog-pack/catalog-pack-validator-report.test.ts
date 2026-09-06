import { describe, expect, test } from "vitest"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import { validateCatalogPackBytes } from "./catalog-pack-validator.ts"

type SortableDiagnostic = {
  readonly severity: string
  readonly code: string
  readonly path: string
  readonly message: string
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

function diagnosticKey(item: SortableDiagnostic): string {
  return [item.severity, item.code, item.path, item.message].join("\u0000")
}

describe("validateCatalogPackBytes", () => {
  test("marks the ready synthetic pack valid and ready", () => {
    const report = validateCatalogPackBytes(bytes(buildReadyCatalogPack()))

    expect(report.valid).toBe(true)
    expect(report.ready).toBe(true)
    expect(report.summary).toMatchObject({
      mealOptions: 21,
      primaryProteinGroups: 3,
      reachableFoods: 3,
      pricedReachableFoods: 3
    })
    expect(report.blockers).toEqual([])
  })

  test("produces an identical report for identical input bytes", () => {
    const input = bytes(buildReadyCatalogPack())
    expect(validateCatalogPackBytes(input)).toEqual(validateCatalogPackBytes(input))
  })

  test("hashes original bytes rather than normalized JSON", () => {
    const compact = new TextEncoder().encode('{"schemaVersion":"1"}')
    const spaced = new TextEncoder().encode('{ "schemaVersion": "1" }')

    expect(validateCatalogPackBytes(compact).inputSha256).not.toBe(
      validateCatalogPackBytes(spaced).inputSha256
    )
  })

  test("returns INVALID_JSON for malformed JSON and invalid UTF-8", () => {
    const malformedInputs = [new TextEncoder().encode("{"), new Uint8Array([0xff])]

    for (const input of malformedInputs) {
      const report = validateCatalogPackBytes(input)
      expect(report).toMatchObject({
        catalogCode: null,
        valid: false,
        ready: false,
        summary: {
          foods: 0,
          recipes: 0,
          priceRows: 0,
          mealOptions: 0,
          primaryProteinGroups: 0,
          reachableFoods: 0,
          pricedReachableFoods: 0
        },
        blockers: []
      })
      expect(report.diagnostics).toHaveLength(1)
      expect(report.diagnostics[0]).toMatchObject({
        severity: "error",
        code: "INVALID_JSON",
        path: "$"
      })
    }
  })

  test("sorts blockers and diagnostics deterministically", () => {
    const pack = buildReadyCatalogPack()
    pack.mealOptions = pack.mealOptions.slice(0, 20)
    for (const meal of pack.mealOptions) meal.version.proteinHintCode = "plant"
    pack.catalogCode = "Bad"

    const report = validateCatalogPackBytes(bytes(pack))
    const diagnosticKeys = report.diagnostics.map(diagnosticKey)

    expect(report.blockers).toEqual([
      "INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY",
      "MINIMUM_MEAL_OPTIONS_NOT_MET"
    ])
    expect(diagnosticKeys).toEqual([...diagnosticKeys].sort())
    expect(report.valid).toBe(false)
    expect(report.ready).toBe(false)
  })

  test("does not add runtime timestamps paths UUIDs or environment data to the report", () => {
    const report = validateCatalogPackBytes(bytes(buildReadyCatalogPack()))
    const serialized = JSON.stringify(report)

    expect(Object.keys(report).sort()).toEqual([
      "blockers",
      "catalogCode",
      "diagnostics",
      "inputSha256",
      "ready",
      "schemaVersion",
      "summary",
      "valid"
    ])
    expect(serialized).not.toContain(process.cwd())
    expect(serialized).not.toMatch(UUID_PATTERN)
  })
})
