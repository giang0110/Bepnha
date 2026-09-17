import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import type { CatalogPackV1 } from "./catalog-pack-types.ts"
import { parseCsv, serializeCsv } from "./catalog-sheet-csv.ts"
import {
  SHEET_FILE_NAMES,
  packToSheets,
  sheetsToPack,
  type SheetBundle
} from "./catalog-sheet-tables.ts"

const USAGE = [
  "Usage:",
  "  npm run catalog:sheet -- export --pack <pack.json> --dir <directory>",
  "  npm run catalog:sheet -- import --dir <directory> --out <pack.json>",
  "",
  "export writes one CSV per table, ready to upload to a spreadsheet.",
  "import reads them back into a pack. Validate the result with catalog:validate;",
  "this command converts shape only and never judges a value."
].join("\n")

interface Options {
  readonly mode: "export" | "import"
  readonly pack: string | null
  readonly dir: string | null
  readonly out: string | null
}

type ParseResult = { ok: true; value: Options } | { ok: false; message: string }

export function parseSheetArgs(argv: readonly string[]): ParseResult {
  const mode = argv[0]
  if (mode !== "export" && mode !== "import") return { ok: false, message: USAGE }

  let pack: string | null = null
  let dir: string | null = null
  let out: string | null = null

  for (let index = 1; index < argv.length; index += 2) {
    const token = argv[index]
    const value = argv[index + 1]
    if (value === undefined || value.startsWith("--")) return { ok: false, message: USAGE }

    if (token === "--pack") {
      if (pack !== null) return { ok: false, message: USAGE }
      pack = value
    } else if (token === "--dir") {
      if (dir !== null) return { ok: false, message: USAGE }
      dir = value
    } else if (token === "--out") {
      if (out !== null) return { ok: false, message: USAGE }
      out = value
    } else {
      return { ok: false, message: USAGE }
    }
  }

  if (dir === null) return { ok: false, message: USAGE }
  if (mode === "export" && pack === null) return { ok: false, message: USAGE }
  if (mode === "import" && out === null) return { ok: false, message: USAGE }

  return { ok: true, value: { mode, pack, dir, out } }
}

function exportSheets(packPath: string, directory: string): string {
  const pack = JSON.parse(readFileSync(packPath, "utf8")) as CatalogPackV1
  const bundle = packToSheets(pack)

  mkdirSync(directory, { recursive: true })
  for (const name of SHEET_FILE_NAMES) {
    writeFileSync(join(directory, name), serializeCsv(bundle[name]), "utf8")
  }
  return `Wrote ${SHEET_FILE_NAMES.length} tables to ${directory}\n`
}

function importSheets(directory: string, outPath: string): { message: string; ok: boolean } {
  const bundle = {} as SheetBundle
  const missingFiles: string[] = []

  for (const name of SHEET_FILE_NAMES) {
    try {
      bundle[name] = parseCsv(readFileSync(join(directory, name), "utf8"))
    } catch {
      missingFiles.push(name)
      bundle[name] = []
    }
  }
  if (missingFiles.length > 0) {
    return { ok: false, message: `Missing or unreadable: ${missingFiles.join(", ")}\n` }
  }

  const { pack, errors } = sheetsToPack(bundle)
  if (errors.length > 0) {
    const lines = errors.map((error) => `  ${error.file}: ${error.message}`)
    return { ok: false, message: `Cannot read the tables:\n${lines.join("\n")}\n` }
  }

  writeFileSync(outPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8")
  return {
    ok: true,
    message: `Wrote ${outPath}\nNow run: npm run catalog:validate -- --input ${outPath}\n`
  }
}

if (import.meta.main) {
  const parsed = parseSheetArgs(process.argv.slice(2))
  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`)
    process.exitCode = 1
  } else if (parsed.value.mode === "export") {
    process.stdout.write(exportSheets(parsed.value.pack as string, parsed.value.dir as string))
  } else {
    const result = importSheets(parsed.value.dir as string, parsed.value.out as string)
    process.stdout.write(result.message)
    if (!result.ok) process.exitCode = 1
  }
}
