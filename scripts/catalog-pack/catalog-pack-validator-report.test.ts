import { describe, expect, test } from "vitest"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import { validateCatalogPackBytes } from "./catalog-pack-validator.ts"

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

function diagnosticKey(item: {
  severity: string
  code: string
  path: string
  message: string
}): string {
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
    const first = validateCatalogPackBytes(input)
    const second = validateCatalogPackBytes(input)

    expect(first).toEqual(second)
  })

  test("hashes original bytes rather than normalized JSON", () => {
    const compact = new TextEncoder().encode('{"schemaVersion":"1"}')
    const spaced = new TextEncoder().encode('{ "schemaVersion": "1" }')
    const compactHash = validateCatalogPackBytes(compact).inputSha256
    const spacedHash = validateCatalogPackBytes(spaced).inputSha256

    expect(compactHash).not.toBe(spacedHash)
  })

  test("returns INVALID_JSON for malformed JSON and invalid UTF-8", () => {
    const malformedInputs = [
      new TextEncoder().encode("{"),
      new Uint8Array([255])
    ]

    for (const input of malformedInputs) {
      const report = validateCatalogPackBytes(input)

      expect(report.catalogCode).toBeNull()
      expect(report.valid).toBe(false)
      expect(report.ready).toBe(false)
      expect(report.summary).toEqual({
        foods: 0,
        recipes: 0,
        priceRows: 0,
        mealOptions: 0,
        primaryProteinGroups: 0,
        reachableFoods: 0,
        pricedReachableFoods: 0
      })
      expect(report.blockers).toEqual([])
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
    for (const meal of pack.mealOptions) {
      meal.version.proteinHintCode = "plant"
    }
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

  test("does not add runtime metadata to the report", () => {
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
    expect(serialized).not.toContain("generatedAt")
    expect(serialized).not.toContain("inputPath")
    expect(serialized).not.toContain("VERCEL_ENV")
  })
})
