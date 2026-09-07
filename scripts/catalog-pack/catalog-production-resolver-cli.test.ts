import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, test, vi } from "vitest"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import { buildResolvableProductionSnapshot } from "./catalog-production-test-builder.ts"
import {
  runCatalogResolveCli,
  type CatalogResolveCliDependencies
} from "./catalog-production-resolver-cli.ts"
import type { CatalogReferenceReader } from "./catalog-production-reader.ts"

const temporaryDirectories: string[] = []

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "bepnha-catalog-resolve-cli-"))
  temporaryDirectories.push(directory)
  return directory
}

function writeInput(value: object): string {
  const directory = createTemporaryDirectory()
  const inputPath = join(directory, "catalog.json")
  writeFileSync(inputPath, `${JSON.stringify(value)}\n`, "utf8")
  return inputPath
}

function captureDependencies(
  createReader: CatalogResolveCliDependencies["createReader"],
  env: NodeJS.ProcessEnv = {}
): {
  readonly dependencies: CatalogResolveCliDependencies
  readonly stdout: string[]
  readonly stderr: string[]
} {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    dependencies: {
      createReader,
      env,
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

function readerForSnapshot(
  snapshot: ReturnType<typeof buildResolvableProductionSnapshot>
): CatalogReferenceReader {
  return {
    loadSnapshot() {
      return Promise.resolve({ ok: true as const, value: snapshot })
    }
  }
}

function parseSingleOutput(stdout: readonly string[]): Record<string, unknown> {
  expect(stdout).toHaveLength(1)
  return JSON.parse(stdout[0] ?? "null") as Record<string, unknown>
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("catalog production resolver CLI", () => {
  test("returns 2 for Phase 9A invalid input without constructing the reader", async () => {
    const inputPath = writeInput({ schemaVersion: "2" })
    const createReader = vi.fn(() => null)
    const captured = captureDependencies(createReader)

    const code = await runCatalogResolveCli(["--input", inputPath], captured.dependencies)

    expect(code).toBe(2)
    expect(createReader).not.toHaveBeenCalled()
    expect(captured.stderr).toEqual([])
    expect(parseSingleOutput(captured.stdout)).toMatchObject({
      resolved: false,
      productionSnapshotSha256: "",
      diagnostics: [{ code: "PHASE_9A_INVALID" }]
    })
  })

  test("returns 3 for a valid but not-ready pack without constructing the reader", async () => {
    const pack = buildReadyCatalogPack()
    pack.mealOptions = pack.mealOptions.slice(0, 20)
    const inputPath = writeInput(pack)
    const createReader = vi.fn(() => null)
    const captured = captureDependencies(createReader)

    const code = await runCatalogResolveCli(["--input", inputPath], captured.dependencies)

    expect(code).toBe(3)
    expect(createReader).not.toHaveBeenCalled()
    expect(parseSingleOutput(captured.stdout)).toMatchObject({
      catalogCode: "launch_v1",
      resolved: false,
      diagnostics: [{ code: "PHASE_9A_NOT_READY" }]
    })
  })

  test("returns 5 for missing runtime configuration without leaking environment values", async () => {
    const pack = buildReadyCatalogPack()
    const inputPath = writeInput(pack)
    const secretSentinel = "do-not-leak-production-secret"
    const createReader = vi.fn(() => null)
    const captured = captureDependencies(createReader, {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: secretSentinel
    })

    const code = await runCatalogResolveCli(["--input", inputPath], captured.dependencies)

    expect(code).toBe(5)
    expect(createReader).toHaveBeenCalledTimes(1)
    const combined = `${captured.stdout.join("")}\n${captured.stderr.join("")}`
    expect(combined).not.toContain(secretSentinel)
    expect(parseSingleOutput(captured.stdout)).toMatchObject({
      resolved: false,
      diagnostics: [{ code: "DEPENDENCY_UNAVAILABLE" }]
    })
  })

  test("returns 5 for a reader dependency failure without vendor error text", async () => {
    const pack = buildReadyCatalogPack()
    const inputPath = writeInput(pack)
    const reader: CatalogReferenceReader = {
      loadSnapshot() {
        return Promise.resolve({ ok: false as const, reason: "DEPENDENCY_UNAVAILABLE" as const })
      }
    }
    const captured = captureDependencies(() => reader)

    const code = await runCatalogResolveCli(["--input", inputPath], captured.dependencies)

    expect(code).toBe(5)
    expect(captured.stderr).toEqual([])
    expect(parseSingleOutput(captured.stdout)).toMatchObject({
      diagnostics: [{ code: "DEPENDENCY_UNAVAILABLE" }]
    })
  })

  test("returns 0 and emits deterministic manifest JSON for a resolvable snapshot", async () => {
    const pack = buildReadyCatalogPack()
    const inputPath = writeInput(pack)
    const snapshot = buildResolvableProductionSnapshot(pack)
    const first = captureDependencies(() => readerForSnapshot(snapshot))
    const second = captureDependencies(() => readerForSnapshot(snapshot))

    const firstCode = await runCatalogResolveCli(["--input", inputPath], first.dependencies)
    const secondCode = await runCatalogResolveCli(["--input", inputPath], second.dependencies)

    expect(firstCode).toBe(0)
    expect(secondCode).toBe(0)
    expect(first.stdout).toEqual(second.stdout)
    expect(parseSingleOutput(first.stdout)).toMatchObject({
      schemaVersion: "1",
      catalogCode: "launch_v1",
      resolved: true,
      diagnostics: []
    })
  })

  test("returns 4 when production reference drift blocks resolution", async () => {
    const pack = buildReadyCatalogPack()
    const inputPath = writeInput(pack)
    const snapshot = buildResolvableProductionSnapshot(pack)
    const drifted = {
      ...snapshot,
      units: snapshot.units.map((row) =>
        row.code === "g" ? { ...row, dimension: "volume" as const } : row
      )
    }
    const captured = captureDependencies(() => readerForSnapshot(drifted))

    const code = await runCatalogResolveCli(["--input", inputPath], captured.dependencies)

    expect(code).toBe(4)
    expect(parseSingleOutput(captured.stdout)).toMatchObject({ resolved: false })
    expect(captured.stdout.join("")).toContain("REFERENCE_DRIFT")
  })

  test("writes output-file bytes exactly equal to stdout", async () => {
    const pack = buildReadyCatalogPack()
    const inputPath = writeInput(pack)
    const outputPath = join(createTemporaryDirectory(), "resolved.json")
    const captured = captureDependencies(() =>
      readerForSnapshot(buildResolvableProductionSnapshot(pack))
    )

    const code = await runCatalogResolveCli(
      ["--input", inputPath, "--output", outputPath],
      captured.dependencies
    )

    expect(code).toBe(0)
    expect(readFileSync(outputPath, "utf8")).toBe(captured.stdout.join(""))
  })

  test("returns 1 for unreadable input with concise stderr", async () => {
    const missingPath = join(createTemporaryDirectory(), "missing.json")
    const captured = captureDependencies(() => null)

    const code = await runCatalogResolveCli(["--input", missingPath], captured.dependencies)

    expect(code).toBe(1)
    expect(captured.stdout).toEqual([])
    expect(captured.stderr.join("")).toMatch(/input/i)
    expect(captured.stderr.join("")).not.toContain("    at ")
  })

  test("returns 1 for an unwritable output with concise stderr", async () => {
    const pack = buildReadyCatalogPack()
    const inputPath = writeInput(pack)
    const outputDirectory = createTemporaryDirectory()
    const captured = captureDependencies(() =>
      readerForSnapshot(buildResolvableProductionSnapshot(pack))
    )

    const code = await runCatalogResolveCli(
      ["--input", inputPath, "--output", outputDirectory],
      captured.dependencies
    )

    expect(code).toBe(1)
    expect(captured.stderr.join("")).toMatch(/output/i)
    expect(captured.stderr.join("")).not.toContain("    at ")
  })

  test("returns 1 for invalid CLI usage", async () => {
    const captured = captureDependencies(() => null)

    const code = await runCatalogResolveCli([], captured.dependencies)

    expect(code).toBe(1)
    expect(captured.stdout).toEqual([])
    expect(captured.stderr.join("")).toContain("Usage:")
  })
})
