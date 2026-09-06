import { describe, expect, test } from "vitest"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import { validateCatalogPackBytes } from "./catalog-pack-validator.ts"

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

function sortedDiagnostics<
  T extends { severity: string; code: string; path: string; message: string }
>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const severity = left.severity.localeCompare(right.severity)
    if (severity !== 0) return severity
    const code = left.code.localeCompare(right.code)
    if (code !== 0) return code
    const path = left.path.localeCompare(right.path)
    if (path !== 0) return path
    return left.message.localeCompare(right.message)
  })
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
    for (const input of [new TextEncoder().encode("{"), new Uint8Array([0xff])]) {
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
      expect(report.diagnostics).toEqual([
        expect.objectContaining({
          severity: "error",
          code: "INVALID_JSON",
          path: "$"
        })
      ])
    }
  })

  test("sorts blockers and diagnostics deterministically", () => {
    const pack = buildReadyCatalogPack()
    pack.mealOptions = pack.mealOptions.slice(0, 20)
    for (const meal of pack.mealOptions) meal.version.proteinHintCode = "plant"
    pack.catalogCode = "Bad"

    const report = validateCatalogPackBytes(bytes(pack))

    expect(report.blockers).toEqual([...report.blockers].sort())
    expect(report.blockers).toEqual([
      "INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY",
      "MINIMUM_MEAL_OPTIONS_NOT_MET"
    ])
    expect(report.diagnostics).toEqual(sortedDiagnostics(report.diagnostics))
    expect(report.valid).toBe(false)
    expect(report.ready).toBe(false)
  })

  test("does not add runtime timestamps paths UUIDs or environment data to the report", () => {
    const report = validateCatalogPackBytes(bytes(buildReadyCatalogPack()))
    const serialized = JSON.stringify(report)

    expect(Object.keys(report).sort()).toEqual(
      [
        "blockers",
        "catalogCode",
        "diagnostics",
        "inputSha256",
        "ready",
        "schemaVersion",
        "summary",
        "valid"
      ].sort()
    )
    expect(serialized).not.toContain(process.cwd())
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu)
  })
})
