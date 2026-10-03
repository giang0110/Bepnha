// @vitest-environment node

import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * Vercel 14 compiles functions with rewriteRelativeImportExtensions enabled. Inspect the emitted
 * import closure so both .js source imports and native-Node .ts imports must resolve to .js in
 * production. Aliases and extensionless runtime imports still fail before a handler runs.
 */

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, found)
    else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) found.push(path)
  }
  return found
}

function resolveRelative(fromFile: string, specifier: string): string | null {
  const withoutExtension = specifier.replace(/\.js$/u, "")
  for (const candidate of [
    `${withoutExtension}.ts`,
    `${withoutExtension}.tsx`,
    `${withoutExtension}/index.ts`
  ]) {
    const path = relative(process.cwd(), resolve(dirname(fromFile), candidate)).replaceAll(
      "\\",
      "/"
    )
    try {
      statSync(path)
      return path
    } catch {
      continue
    }
  }
  return null
}

interface Problem {
  readonly file: string
  readonly specifier: string
  readonly reason: "alias" | "missing extension"
}

function inspectServerlessClosure(): { files: string[]; problems: Problem[] } {
  const visited = new Set<string>()
  const queue = sourceFiles("api")
  const problems: Problem[] = []

  while (queue.length > 0) {
    const file = queue.shift() as string
    if (visited.has(file)) continue
    visited.add(file)

    const source = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file,
      compilerOptions: {
        target: ts.ScriptTarget.ES2024,
        module: ts.ModuleKind.ESNext,
        rewriteRelativeImportExtensions: true
      }
    }).outputText
    for (const match of source.matchAll(/\bfrom\s*"([^"]+)"/gu)) {
      const specifier = match[1] as string

      if (specifier.startsWith("@/")) {
        problems.push({ file, specifier, reason: "alias" })
        continue
      }
      if (!specifier.startsWith(".")) continue
      if (!specifier.endsWith(".js")) {
        problems.push({ file, specifier, reason: "missing extension" })
      }

      const target = resolveRelative(file, specifier)
      if (target !== null && !visited.has(target)) queue.push(target)
    }
  }

  return { files: [...visited], problems }
}

describe("every module a serverless function loads", () => {
  const { files, problems } = inspectServerlessClosure()

  it("rewrites native TypeScript extensions into deployable JavaScript imports", () => {
    const result = ts.transpileModule('import { value } from "./quantity.ts"; export { value }', {
      compilerOptions: { module: ts.ModuleKind.ESNext, rewriteRelativeImportExtensions: true }
    })
    expect(result.outputText).toContain('from "./quantity.js"')
    expect(
      JSON.parse(readFileSync("tsconfig.api.json", "utf8")) as {
        compilerOptions: { rewriteRelativeImportExtensions: boolean }
      }
    ).toMatchObject({ compilerOptions: { rewriteRelativeImportExtensions: true } })
  })

  it("reaches beyond api/ into the shared source tree", () => {
    // A closure of only the entrypoints would mean this test proves nothing.
    expect(files.length).toBeGreaterThan(20)
    expect(files.some((file) => file.replaceAll("\\", "/").startsWith("src/"))).toBe(true)
  })

  it("uses no path alias, because Node resolves one as an npm package", () => {
    expect(problems.filter((problem) => problem.reason === "alias")).toEqual([])
  })

  it("gives every relative import a file extension, as Node ESM requires", () => {
    expect(problems.filter((problem) => problem.reason === "missing extension")).toEqual([])
  })
})
