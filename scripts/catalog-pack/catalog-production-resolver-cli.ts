import { readFileSync, writeFileSync } from "node:fs"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { validateCatalogPackBytes } from "./catalog-pack-report.ts"
import type { CatalogPackV1 } from "./catalog-pack-types.ts"
import { validateCatalogPackValue } from "./catalog-pack-validator.ts"
import type { CatalogReferenceReader } from "./catalog-production-reader.ts"
import { resolveCatalogProductionReferences } from "./catalog-production-resolver.ts"
import { createRuntimeCatalogProductionReader } from "./supabase-catalog-production-reader.ts"

const USAGE = "Usage: npm run catalog:resolve -- --input <path> [--output <path>]"

interface CliArgs {
  readonly input: string
  readonly output: string | null
}

type ParseArgsResult =
  { readonly ok: true; readonly value: CliArgs } | { readonly ok: false; readonly message: string }

export interface CatalogResolveCliDependencies {
  readonly createReader: (env: NodeJS.ProcessEnv) => CatalogReferenceReader | null
  readonly env: NodeJS.ProcessEnv
  readonly stdout: (value: string) => void
  readonly stderr: (value: string) => void
}

const runtimeDependencies: CatalogResolveCliDependencies = {
  createReader: createRuntimeCatalogProductionReader,
  env: process.env,
  stdout(value) {
    process.stdout.write(value)
  },
  stderr(value) {
    process.stderr.write(value)
  }
}

function parseArgs(argv: readonly string[]): ParseArgsResult {
  let input: string | null = null
  let output: string | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token !== "--input" && token !== "--output") {
      return { ok: false, message: USAGE }
    }

    const value = argv[index + 1]
    if (value === undefined || value.startsWith("--")) {
      return { ok: false, message: USAGE }
    }

    if (token === "--input") {
      if (input !== null) return { ok: false, message: USAGE }
      input = value
    } else {
      if (output !== null) return { ok: false, message: USAGE }
      output = value
    }

    index += 1
  }

  if (input === null) return { ok: false, message: USAGE }
  return { ok: true, value: { input, output } }
}

function failureManifest(
  catalogCode: string | null,
  inputSha256: string,
  code: "PHASE_9A_INVALID" | "PHASE_9A_NOT_READY" | "DEPENDENCY_UNAVAILABLE",
  message: string
): object {
  return {
    schemaVersion: "1",
    catalogCode,
    inputSha256,
    productionSnapshotSha256: "",
    resolved: false,
    references: {
      units: [],
      categories: [],
      allergens: [],
      nutrients: [],
      dietaryTags: [],
      priceRegion: null,
      recipeTags: []
    },
    foods: [],
    recipes: [],
    priceBook: null,
    mealOptions: [],
    diagnostics: [{ severity: "error", code, path: "$", message }]
  }
}

function packFromValidatedBytes(input: Uint8Array): CatalogPackV1 | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(input)
    const value = JSON.parse(text) as unknown
    return validateCatalogPackValue(value).pack
  } catch {
    return null
  }
}

function emitJson(
  value: object,
  outputPath: string | null,
  dependencies: CatalogResolveCliDependencies
): boolean {
  const output = `${JSON.stringify(value, null, 2)}\n`
  if (outputPath !== null) {
    try {
      writeFileSync(outputPath, output, "utf8")
    } catch {
      dependencies.stderr("Catalog resolver output could not be written.\n")
      return false
    }
  }
  dependencies.stdout(output)
  return true
}

export async function runCatalogResolveCli(
  argv: readonly string[],
  dependencies: CatalogResolveCliDependencies = runtimeDependencies
): Promise<number> {
  const parsed = parseArgs(argv)
  if (!parsed.ok) {
    dependencies.stderr(`${parsed.message}\n`)
    return 1
  }

  let input: Uint8Array
  try {
    input = readFileSync(parsed.value.input)
  } catch {
    dependencies.stderr("Catalog resolver input could not be read.\n")
    return 1
  }

  const phase9A = validateCatalogPackBytes(input)
  if (!phase9A.valid) {
    const output = failureManifest(
      phase9A.catalogCode,
      phase9A.inputSha256,
      "PHASE_9A_INVALID",
      "Catalog pack failed Phase 9A validation"
    )
    return emitJson(output, parsed.value.output, dependencies) ? 2 : 1
  }

  if (!phase9A.ready) {
    const output = failureManifest(
      phase9A.catalogCode,
      phase9A.inputSha256,
      "PHASE_9A_NOT_READY",
      "Catalog pack is valid but not ready for production resolution"
    )
    return emitJson(output, parsed.value.output, dependencies) ? 3 : 1
  }

  const pack = packFromValidatedBytes(input)
  if (pack === null) {
    const output = failureManifest(
      phase9A.catalogCode,
      phase9A.inputSha256,
      "PHASE_9A_INVALID",
      "Catalog pack failed Phase 9A validation"
    )
    return emitJson(output, parsed.value.output, dependencies) ? 2 : 1
  }

  let reader: CatalogReferenceReader | null
  try {
    reader = dependencies.createReader(dependencies.env)
  } catch {
    reader = null
  }

  if (reader === null) {
    const output = failureManifest(
      pack.catalogCode,
      phase9A.inputSha256,
      "DEPENDENCY_UNAVAILABLE",
      "Production catalog dependency is unavailable"
    )
    return emitJson(output, parsed.value.output, dependencies) ? 5 : 1
  }

  let snapshotResult: Awaited<ReturnType<CatalogReferenceReader["loadSnapshot"]>>
  try {
    snapshotResult = await reader.loadSnapshot(pack)
  } catch {
    const output = failureManifest(
      pack.catalogCode,
      phase9A.inputSha256,
      "DEPENDENCY_UNAVAILABLE",
      "Production catalog dependency is unavailable"
    )
    return emitJson(output, parsed.value.output, dependencies) ? 5 : 1
  }

  if (!snapshotResult.ok) {
    const output = failureManifest(
      pack.catalogCode,
      phase9A.inputSha256,
      "DEPENDENCY_UNAVAILABLE",
      "Production catalog dependency is unavailable"
    )
    return emitJson(output, parsed.value.output, dependencies) ? 5 : 1
  }

  const manifest = resolveCatalogProductionReferences(
    pack,
    phase9A.inputSha256,
    snapshotResult.value
  )
  if (!emitJson(manifest, parsed.value.output, dependencies)) return 1
  return manifest.resolved ? 0 : 4
}

function isDirectExecution(): boolean {
  const entry = process.argv[1]
  return entry !== undefined && fileURLToPath(import.meta.url) === entry
}

if (isDirectExecution()) {
  runCatalogResolveCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch(() => {
      process.stderr.write("Catalog resolver failed.\n")
      process.exitCode = 1
    })
}
