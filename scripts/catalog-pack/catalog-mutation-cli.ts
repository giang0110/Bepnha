import { readFileSync, writeFileSync } from "node:fs"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { planCatalogMutations } from "./catalog-mutation-planner.ts"
import type { CatalogMutationPlanV1 } from "./catalog-mutation-types.ts"

const USAGE = "Usage: npm run catalog:plan -- --input <path> --manifest <path> [--output <path>]"

interface CliArgs {
  readonly input: string
  readonly manifest: string
  readonly output: string | null
}

type ParseArgsResult =
  { readonly ok: true; readonly value: CliArgs } | { readonly ok: false; readonly message: string }

export interface CatalogPlanCliDependencies {
  readonly stdout: (value: string) => void
  readonly stderr: (value: string) => void
}

const runtimeDependencies: CatalogPlanCliDependencies = {
  stdout(value) {
    process.stdout.write(value)
  },
  stderr(value) {
    process.stderr.write(value)
  }
}

function parseArgs(argv: readonly string[]): ParseArgsResult {
  let input: string | null = null
  let manifest: string | null = null
  let output: string | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token !== "--input" && token !== "--manifest" && token !== "--output") {
      return { ok: false, message: USAGE }
    }

    const value = argv[index + 1]
    if (value === undefined || value.startsWith("--")) {
      return { ok: false, message: USAGE }
    }

    if (token === "--input") {
      if (input !== null) return { ok: false, message: USAGE }
      input = value
    } else if (token === "--manifest") {
      if (manifest !== null) return { ok: false, message: USAGE }
      manifest = value
    } else {
      if (output !== null) return { ok: false, message: USAGE }
      output = value
    }

    index += 1
  }

  if (input === null || manifest === null) {
    return { ok: false, message: USAGE }
  }

  return { ok: true, value: { input, manifest, output } }
}

function serializePlan(plan: CatalogMutationPlanV1): string {
  return `${JSON.stringify(plan, null, 2)}\n`
}

function emitPlan(
  plan: CatalogMutationPlanV1,
  outputPath: string | null,
  dependencies: CatalogPlanCliDependencies
): boolean {
  const output = serializePlan(plan)

  if (outputPath !== null) {
    try {
      writeFileSync(outputPath, output, "utf8")
    } catch {
      dependencies.stderr("Catalog mutation plan output could not be written.\n")
      return false
    }
  }

  dependencies.stdout(output)
  return true
}

function exitCodeForPlan(plan: CatalogMutationPlanV1): 0 | 2 | 3 | 4 {
  if (plan.executable) return 0

  const code = plan.diagnostics[0]?.code
  if (code === "PHASE_9A_INVALID") return 2
  if (code === "PHASE_9A_NOT_READY") return 3
  return 4
}

export function runCatalogPlanCli(
  argv: readonly string[],
  dependencies: CatalogPlanCliDependencies = runtimeDependencies
): number {
  const parsed = parseArgs(argv)
  if (!parsed.ok) {
    dependencies.stderr(`${parsed.message}\n`)
    return 1
  }

  let inputBytes: Uint8Array
  try {
    inputBytes = readFileSync(parsed.value.input)
  } catch {
    dependencies.stderr("Catalog mutation plan input could not be read.\n")
    return 1
  }

  let manifestBytes: Uint8Array
  try {
    manifestBytes = readFileSync(parsed.value.manifest)
  } catch {
    dependencies.stderr("Catalog mutation plan manifest could not be read.\n")
    return 1
  }

  const plan = planCatalogMutations(inputBytes, manifestBytes)
  if (!emitPlan(plan, parsed.value.output, dependencies)) return 1
  return exitCodeForPlan(plan)
}

function isDirectExecution(): boolean {
  const entry = process.argv[1]
  return entry !== undefined && fileURLToPath(import.meta.url) === entry
}

if (isDirectExecution()) {
  try {
    process.exitCode = runCatalogPlanCli(process.argv.slice(2))
  } catch {
    process.stderr.write("Catalog mutation planner failed.\n")
    process.exitCode = 1
  }
}
