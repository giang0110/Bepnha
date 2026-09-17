// @vitest-environment node

import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Vercel compiles `api/*.ts` in place instead of bundling, and TypeScript never rewrites import
 * specifiers on emit. Whatever is written here reaches Node verbatim, and Node applies ESM rules:
 * a bare specifier is an npm package, and a relative one needs a file extension.
 *
 * Both mistakes fail the same way, at module load, before a single line of a handler runs:
 *
 *   ERR_MODULE_NOT_FOUND: Cannot find package '@/infrastructure'
 *   imported from /var/task/api/health.js
 *
 * Nothing else catches this. Vitest, tsc and Vite all resolve `@/` happily, so the whole test
 * suite stayed green while every function in production returned 500. This walks the real import
 * closure from the deployed entrypoints and checks what Node will see.
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
    const path = relative(process.cwd(), resolve(dirname(fromFile), candidate))
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

    const source = readFileSync(file, "utf8")
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

  it("reaches beyond api/ into the shared source tree", () => {
    // A closure of only the entrypoints would mean this test proves nothing.
    expect(files.length).toBeGreaterThan(20)
    expect(files.some((file) => file.startsWith("src/"))).toBe(true)
  })

  it("uses no path alias, because Node resolves one as an npm package", () => {
    expect(problems.filter((problem) => problem.reason === "alias")).toEqual([])
  })

  it("gives every relative import a file extension, as Node ESM requires", () => {
    expect(problems.filter((problem) => problem.reason === "missing extension")).toEqual([])
  })
})
