/* global process */

import { execFile } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const outputPath = resolve("src/infrastructure/supabase/database.types.ts")

/** @param {readonly string[]} arguments_ */
async function runSupabase(arguments_) {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx"
  const { stdout } = await execFileAsync(executable, ["--no-install", ...arguments_], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  })
  return stdout
}

/**
 * @param {{
 *   mode: "check" | "generate"
 *   readOutput?: () => Promise<string>
 *   runCommand?: (arguments_: readonly string[]) => Promise<string>
 *   writeOutput?: (contents: string) => Promise<void>
 * }} options
 */
export async function generateDatabaseTypes({
  mode,
  readOutput = () => readFile(outputPath, "utf8"),
  runCommand = runSupabase,
  writeOutput = (contents) => writeFile(outputPath, contents, "utf8")
}) {
  const generated = await runCommand([
    "supabase",
    "gen",
    "types",
    "typescript",
    "--local",
    "--schema",
    "public"
  ])

  if (mode === "generate") {
    await writeOutput(generated)
    return
  }

  if ((await readOutput()) !== generated) {
    throw new Error("Generated database types are stale; run npm run db:types:generate")
  }
}

if (import.meta.main) {
  const mode = process.argv[2]
  if (mode !== "generate" && mode !== "check") {
    throw new Error("Expected generate or check mode")
  }

  generateDatabaseTypes({ mode }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Type generation failed"}\n`)
    process.exitCode = 1
  })
}
