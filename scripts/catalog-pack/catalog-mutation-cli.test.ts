import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, test } from "vitest"

import { runCatalogPlanCli, type CatalogPlanCliDependencies } from "./catalog-mutation-cli.ts"
import { buildPlanningFixture, encodeJson } from "./catalog-mutation-test-builder.ts"

const temporaryDirectories: string[] = []
const usage = "Usage: npm run catalog:plan -- --input <path> --manifest <path> [--output <path>]\n"

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "bepnha-catalog-plan-cli-"))
  temporaryDirectories.push(directory)
  return directory
}

function writeBytes(fileName: string, bytes: Uint8Array): string {
  const path = join(createTemporaryDirectory(), fileName)
  writeFileSync(path, bytes)
  return path
}

function captureDependencies(): {
  readonly dependencies: CatalogPlanCliDependencies
  readonly stdout: string[]
  readonly stderr: string[]
} {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    dependencies: {
      stdout(value) {
        stdout.push(value)
      },
      stderr(value) {
        stderr.push(value)
      }
    },
    stdout,
    stderr
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("catalog mutation plan CLI", () => {
  test.each([
    ["unknown argument", ["--input", "pack.json", "--manifest", "manifest.json", "--wat"]],
    [
      "duplicate argument",
      ["--input", "one.json", "--input", "two.json", "--manifest", "manifest.json"]
    ],
    ["missing value", ["--input", "pack.json", "--manifest"]],
    ["missing input", ["--manifest", "manifest.json"]],
    ["missing manifest", ["--input", "pack.json"]]
  ])("returns 1 for %s", (_label, argv) => {
    const captured = captureDependencies()

    expect(runCatalogPlanCli(argv, captured.dependencies)).toBe(1)
    expect(captured.stdout).toEqual([])
    expect(captured.stderr).toEqual([usage])
  })

  test("returns 1 for an unreadable local pack without leaking filesystem details", () => {
    const fixture = buildPlanningFixture()
    const manifestPath = writeBytes("catalog.resolved.json", fixture.manifestBytes)
    const missingInput = join(createTemporaryDirectory(), "missing.json")
    const captured = captureDependencies()

    expect(
      runCatalogPlanCli(
        ["--input", missingInput, "--manifest", manifestPath],
        captured.dependencies
      )
    ).toBe(1)
    expect(captured.stdout).toEqual([])
    expect(captured.stderr.join("")).toMatch(/input/i)
    expect(captured.stderr.join("")).not.toContain("ENOENT")
    expect(captured.stderr.join("")).not.toContain("    at ")
  })

  test("returns 1 for an unreadable local manifest", () => {
    const fixture = buildPlanningFixture()
    const inputPath = writeBytes("catalog.json", fixture.packBytes)
    const missingManifest = join(createTemporaryDirectory(), "missing.resolved.json")
    const captured = captureDependencies()

    expect(
      runCatalogPlanCli(
        ["--input", inputPath, "--manifest", missingManifest],
        captured.dependencies
      )
    ).toBe(1)
    expect(captured.stdout).toEqual([])
    expect(captured.stderr.join("")).toMatch(/manifest/i)
    expect(captured.stderr.join("")).not.toContain("ENOENT")
  })

  test("returns 1 for an unwritable local output", () => {
    const fixture = buildPlanningFixture()
    const inputPath = writeBytes("catalog.json", fixture.packBytes)
    const manifestPath = writeBytes("catalog.resolved.json", fixture.manifestBytes)
    const outputDirectory = createTemporaryDirectory()
    const captured = captureDependencies()

    expect(
      runCatalogPlanCli(
        ["--input", inputPath, "--manifest", manifestPath, "--output", outputDirectory],
        captured.dependencies
      )
    ).toBe(1)
    expect(captured.stderr.join("")).toMatch(/output/i)
    expect(captured.stderr.join("")).not.toContain("EISDIR")
  })

  test("returns 2 and emits the deterministic plan for Phase 9A invalid input", () => {
    const fixture = buildPlanningFixture()
    const invalidBytes = encodeJson({ ...fixture.pack, catalogCode: "Launch" })
    const inputPath = writeBytes("invalid.json", invalidBytes)
    const manifestPath = writeBytes("catalog.resolved.json", fixture.manifestBytes)
    const captured = captureDependencies()

    expect(
      runCatalogPlanCli(["--input", inputPath, "--manifest", manifestPath], captured.dependencies)
    ).toBe(2)
    expect(captured.stderr).toEqual([])
    expect(JSON.parse(captured.stdout.join(""))).toMatchObject({
      executable: false,
      diagnostics: [{ code: "PHASE_9A_INVALID" }]
    })
  })

  test("returns 3 for a valid but not-ready Phase 9A pack", () => {
    const fixture = buildPlanningFixture()
    const notReadyBytes = encodeJson({
      ...fixture.pack,
      mealOptions: fixture.pack.mealOptions.slice(0, 20)
    })
    const inputPath = writeBytes("not-ready.json", notReadyBytes)
    const manifestPath = writeBytes("catalog.resolved.json", fixture.manifestBytes)
    const captured = captureDependencies()

    expect(
      runCatalogPlanCli(["--input", inputPath, "--manifest", manifestPath], captured.dependencies)
    ).toBe(3)
    expect(JSON.parse(captured.stdout.join(""))).toMatchObject({
      executable: false,
      diagnostics: [{ code: "PHASE_9A_NOT_READY" }]
    })
  })

  test("returns 4 for manifest or integrity planning failures", () => {
    const fixture = buildPlanningFixture()
    const inputPath = writeBytes("catalog.json", fixture.packBytes)
    const malformedManifestPath = writeBytes("catalog.resolved.json", new TextEncoder().encode("{"))
    const captured = captureDependencies()

    expect(
      runCatalogPlanCli(
        ["--input", inputPath, "--manifest", malformedManifestPath],
        captured.dependencies
      )
    ).toBe(4)
    expect(JSON.parse(captured.stdout.join(""))).toMatchObject({
      executable: false,
      diagnostics: [{ code: "MANIFEST_INVALID" }]
    })
  })

  test("returns 0 and emits byte-stable executable plan JSON", () => {
    const fixture = buildPlanningFixture()
    const inputPath = writeBytes("catalog.json", fixture.packBytes)
    const manifestPath = writeBytes("catalog.resolved.json", fixture.manifestBytes)
    const first = captureDependencies()
    const second = captureDependencies()

    expect(
      runCatalogPlanCli(["--input", inputPath, "--manifest", manifestPath], first.dependencies)
    ).toBe(0)
    expect(
      runCatalogPlanCli(["--input", inputPath, "--manifest", manifestPath], second.dependencies)
    ).toBe(0)
    expect(first.stderr).toEqual([])
    expect(first.stdout).toEqual(second.stdout)
    expect(first.stdout).toHaveLength(1)
    expect(first.stdout[0]?.endsWith("\n")).toBe(true)
    expect(JSON.parse(first.stdout[0] ?? "null")).toMatchObject({
      schemaVersion: "1",
      executable: true,
      diagnostics: []
    })
  })

  test("writes output-file bytes exactly equal to stdout", () => {
    const fixture = buildPlanningFixture()
    const inputPath = writeBytes("catalog.json", fixture.packBytes)
    const manifestPath = writeBytes("catalog.resolved.json", fixture.manifestBytes)
    const outputPath = join(createTemporaryDirectory(), "catalog.plan.json")
    const captured = captureDependencies()

    expect(
      runCatalogPlanCli(
        ["--input", inputPath, "--manifest", manifestPath, "--output", outputPath],
        captured.dependencies
      )
    ).toBe(0)
    expect(readFileSync(outputPath, "utf8")).toBe(captured.stdout.join(""))
  })
})
