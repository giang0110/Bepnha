import { createHash } from "node:crypto"

import { validateCatalogPackValue } from "./catalog-pack-validator.ts"
import {
  CATALOG_PACK_SCHEMA_VERSION,
  type CatalogPackDiagnostic,
  type CatalogPackValidationReport
} from "./catalog-pack-types.ts"

const ZERO_SUMMARY: CatalogPackValidationReport["summary"] = {
  foods: 0,
  recipes: 0,
  priceRows: 0,
  mealOptions: 0,
  primaryProteinGroups: 0,
  reachableFoods: 0,
  pricedReachableFoods: 0
}

function sha256(input: Uint8Array): string {
  return createHash("sha256").update(input).digest("hex")
}

function parseJsonBytes(input: Uint8Array):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(input)
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}

function compareDiagnostics(left: CatalogPackDiagnostic, right: CatalogPackDiagnostic): number {
  const severity = left.severity.localeCompare(right.severity)
  if (severity !== 0) return severity

  const code = left.code.localeCompare(right.code)
  if (code !== 0) return code

  const path = left.path.localeCompare(right.path)
  if (path !== 0) return path

  return left.message.localeCompare(right.message)
}

function sortDiagnostics(diagnostics: readonly CatalogPackDiagnostic[]): CatalogPackDiagnostic[] {
  return [...diagnostics].sort(compareDiagnostics)
}

function invalidJsonReport(inputSha256: string): CatalogPackValidationReport {
  return {
    schemaVersion: CATALOG_PACK_SCHEMA_VERSION,
    inputSha256,
    catalogCode: null,
    valid: false,
    ready: false,
    summary: ZERO_SUMMARY,
    blockers: [],
    diagnostics: [
      {
        severity: "error",
        code: "INVALID_JSON",
        path: "$",
        message: "Input must be valid UTF-8 JSON"
      }
    ]
  }
}

export function validateCatalogPackBytes(input: Uint8Array): CatalogPackValidationReport {
  const inputSha256 = sha256(input)
  const parsed = parseJsonBytes(input)
  if (!parsed.ok) return invalidJsonReport(inputSha256)

  const core = validateCatalogPackValue(parsed.value)
  const diagnostics = sortDiagnostics(core.diagnostics)
  const blockers = [...new Set(core.blockers)].sort()
  const valid = !diagnostics.some((diagnostic) => diagnostic.severity === "error")

  return {
    schemaVersion: CATALOG_PACK_SCHEMA_VERSION,
    inputSha256,
    catalogCode: core.catalogCode,
    valid,
    ready: valid && blockers.length === 0,
    summary: core.summary,
    blockers,
    diagnostics
  }
}
