// @vitest-environment node

import { execFileSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * Vercel discovers the nearest tsconfig.json from an API entrypoint. Its legacy compiler path
 * does not enable extension rewriting itself. Inspect that configuration's emitted imports and
 * boot a compiled handler in plain Node so a passing source-only test cannot hide a deploy crash.
 */

function apiCompilerOptions(): ts.CompilerOptions {
  const configPath = ts.findConfigFile(
    "api/plans",
    (file) => ts.sys.fileExists(file),
    "tsconfig.json"
  )
  if (configPath === undefined) throw new Error("API compiler configuration not found")
  const config = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file))
  if (config.error !== undefined) throw new Error("API compiler configuration could not be read")
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath))
  return {
    ...parsed.options,
    target: parsed.options.target ?? ts.ScriptTarget.ES2024,
    module: parsed.options.module ?? ts.ModuleKind.ESNext,
    noEmit: false,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    inlineSourceMap: false
  }
}

const compilerOptions = apiCompilerOptions()

function emittedSource(file: string): string {
  return ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions
  }).outputText
}

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

    const source = emittedSource(file)
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
      compilerOptions
    })
    expect(result.outputText).toContain('from "./quantity.js"')
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

  it("boots the compiled current-plan handler and rejects a signed-out read", () => {
    const parent = join(process.cwd(), "node_modules/.tmp")
    mkdirSync(parent, { recursive: true })
    const output = mkdtempSync(join(parent, "serverless-boot-"))
    try {
      for (const file of files) {
        const destination = join(output, file.replace(/\.ts$/u, ".js"))
        mkdirSync(dirname(destination), { recursive: true })
        writeFileSync(destination, emittedSource(file))
      }
      const entry = pathToFileURL(join(output, "api/plans/current.js")).href
      const script = `
        const { default: handler } = await import(${JSON.stringify(entry)});
        const response = {
          headers: {},
          setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
          status(value) { this.statusCode = value; return this; },
          json(value) { this.body = value; return this; }
        };
        await handler({ method: 'GET', headers: {}, query: {} }, response);
        console.log(JSON.stringify({ status: response.statusCode, body: response.body, headers: response.headers }));
      `
      const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: output,
        encoding: "utf8",
        env: { PATH: process.env.PATH }
      })
      const result = JSON.parse(stdout.trim().split("\n").at(-1) as string) as {
        status: number
        body: unknown
        headers: Record<string, string>
      }
      expect(result).toMatchObject({ status: 401, body: { error: "UNAUTHORIZED" } })
      expect(result.headers["x-correlation-id"]).toMatch(/^[a-zA-Z0-9._-]{1,128}$/u)
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  })
})
