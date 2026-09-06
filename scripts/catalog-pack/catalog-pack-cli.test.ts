import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, test } from "vitest"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"

const temporaryDirectories: string[] = []

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "bepnha-catalog-cli-"))
  temporaryDirectories.push(directory)
  return directory
}

function writeJsonInput(value: object): string {
  const directory = createTemporaryDirectory()
  const inputPath = join(directory, "input.json")
  writeFileSync(inputPath, `${JSON.stringify(value)}\n`, "utf8")
  return inputPath
}

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, ["scripts/catalog-pack/catalog-pack-cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  })
}

function parseStdout(stdout: string): unknown {
  try {
    return JSON.parse(stdout) as unknown
  } catch {
    return null
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("catalog-pack CLI", () => {
  test("returns 0 and a ready report for the ready synthetic pack", () => {
    const inputPath = writeJsonInput(buildReadyCatalogPack())
    const result = runCli(["--input", inputPath])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(parseStdout(result.stdout)).toMatchObject({ valid: true, ready: true })
  })

  test("returns 2 for a structurally invalid catalog pack", () => {
    const inputPath = writeJsonInput({ schemaVersion: "2" })
    const result = runCli(["--input", inputPath])

    expect(result.status).toBe(2)
    expect(result.stderr).toBe("")
    expect(parseStdout(result.stdout)).toMatchObject({ valid: false, ready: false })
  })

  test("returns 3 for a valid catalog pack that is not launch ready", () => {
    const pack = buildReadyCatalogPack()
    pack.mealOptions = pack.mealOptions.slice(0, 20)
    const inputPath = writeJsonInput(pack)
    const result = runCli(["--input", inputPath])

    expect(result.status).toBe(3)
    expect(result.stderr).toBe("")
    expect(parseStdout(result.stdout)).toMatchObject({ valid: true, ready: false })
  })

  test("rejects missing arguments with usage on stderr", () => {
    const result = runCli([])

    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("Usage:")
  })

  test("rejects --input without a value", () => {
    const result = runCli(["--input"])

    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("Usage:")
  })

  test("rejects duplicate --input", () => {
    const inputPath = writeJsonInput(buildReadyCatalogPack())
    const result = runCli(["--input", inputPath, "--input", inputPath])

    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("Usage:")
  })

  test("rejects unknown flags", () => {
    const result = runCli(["--foo"])

    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("Usage:")
  })

  test("returns 1 with concise stderr when the input cannot be read", () => {
    const directory = createTemporaryDirectory()
    const missingPath = join(directory, "missing.json")
    const result = runCli(["--input", missingPath])

    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toMatch(/input/i)
    expect(result.stderr).not.toContain("    at ")
  })

  test("writes report bytes identical to stdout", () => {
    const inputPath = writeJsonInput(buildReadyCatalogPack())
    const directory = createTemporaryDirectory()
    const reportPath = join(directory, "report.json")
    const result = runCli(["--input", inputPath, "--report", reportPath])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(readFileSync(reportPath, "utf8")).toBe(result.stdout)
  })

  test("does not include the absolute input path in report stdout", () => {
    const inputPath = writeJsonInput(buildReadyCatalogPack())
    const result = runCli(["--input", inputPath])

    expect(result.status).toBe(0)
    expect(result.stdout).not.toContain(inputPath)
  })

  test("returns 1 with concise stderr when the report cannot be written", () => {
    const inputPath = writeJsonInput(buildReadyCatalogPack())
    const reportDirectory = createTemporaryDirectory()
    const result = runCli(["--input", inputPath, "--report", reportDirectory])

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/report/i)
    expect(result.stderr).not.toContain("    at ")
  })
})
