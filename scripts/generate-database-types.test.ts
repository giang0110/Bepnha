// @vitest-environment node

import { describe, expect, it, vi } from "vitest"

import { generateDatabaseTypes } from "./generate-database-types.mjs"

describe("generateDatabaseTypes", () => {
  it("uses only the local public schema command and writes generated output", async () => {
    const runCommand = vi.fn(() => Promise.resolve("export type Database = {}\n"))
    const writeOutput = vi.fn(() => Promise.resolve())

    await generateDatabaseTypes({ mode: "generate", runCommand, writeOutput })

    expect(runCommand).toHaveBeenCalledWith([
      "supabase",
      "gen",
      "types",
      "typescript",
      "--local",
      "--schema",
      "public"
    ])
    expect(writeOutput).toHaveBeenCalledWith("export type Database = {}\n")
    expect(JSON.stringify(runCommand.mock.calls)).not.toMatch(/linked|project-id|db-url/i)
  })

  it("passes when committed database types exactly match local generation", async () => {
    await expect(
      generateDatabaseTypes({
        mode: "check",
        readOutput: vi.fn(() => Promise.resolve("generated\n")),
        runCommand: vi.fn(() => Promise.resolve("generated\n"))
      })
    ).resolves.toBeUndefined()
  })

  it("fails closed when generated database types have drifted", async () => {
    await expect(
      generateDatabaseTypes({
        mode: "check",
        readOutput: vi.fn(() => Promise.resolve("committed\n")),
        runCommand: vi.fn(() => Promise.resolve("generated\n"))
      })
    ).rejects.toThrow("Generated database types are stale")
  })
})
