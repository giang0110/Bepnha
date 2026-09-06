import { readFileSync, writeFileSync } from "node:fs"
import process from "node:process"

import { validateCatalogPackBytes } from "./catalog-pack-report.ts"
import type { CatalogPackValidationReport } from "./catalog-pack-types.ts"

const USAGE = "Usage: npm run catalog:validate -- --input <path> [--report <path>]"

type CliArgs = {
  readonly input: string
  readonly report: string | null
}

type ParseArgsResult =
  | {
      readonly ok: true
      readonly value: CliArgs
    }
  | {
      readonly ok: false
      readonly message: string
    }

function parseArgs(argv: readonly string[]): ParseArgsResult {
  let input: string | null = null
  let report: string | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token !== "--input" && token !== "--report") {
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
      if (report !== null) return { ok: false, message: USAGE }
      report = value
    }

    index += 1
  }

  if (input === null) return { ok: false, message: USAGE }
  return { ok: true, value: { input, report } }
}

function exitCodeForReport(report: CatalogPackValidationReport): 0 | 2 | 3 {
  if (!report.valid) return 2
  return report.ready ? 0 : 3
}

function writeError(message: string): void {
  process.stderr.write(`${message}\n`)
}

function main(argv = process.argv.slice(2)): void {
  const parsed = parseArgs(argv)
  if (!parsed.ok) {
    writeError(parsed.message)
    process.exitCode = 1
    return
  }

  let input: Uint8Array
  try {
    input = readFileSync(parsed.value.input)
  } catch {
    writeError("Catalog pack input could not be read.")
    process.exitCode = 1
    return
  }

  const report = validateCatalogPackBytes(input)
  const output = `${JSON.stringify(report, null, 2)}\n`
  process.stdout.write(output)

  if (parsed.value.report !== null) {
    try {
      writeFileSync(parsed.value.report, output, "utf8")
    } catch {
      writeError("Catalog pack report could not be written.")
      process.exitCode = 1
      return
    }
  }

  process.exitCode = exitCodeForReport(report)
}

main()
