import { describe, expect, it, vi } from "vitest"

import { localPublicEnvironmentFromStatus, runWithLocalSupabase } from "./local-supabase-env.mjs"

const publishableKey = "sb_publishable_local-test-value"
const localStatus = `API_URL="http://127.0.0.1:54321"
PUBLISHABLE_KEY="${publishableKey}"
`

describe("local Supabase environment", () => {
  it("maps only the four public application variables from loopback status", () => {
    expect(localPublicEnvironmentFromStatus(localStatus)).toEqual({
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_PUBLISHABLE_KEY: publishableKey,
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey
    })
  })

  it.each([
    'API_URL="https://project.supabase.co"\nPUBLISHABLE_KEY="public"',
    'API_URL="http://192.168.1.10:54321"\nPUBLISHABLE_KEY="public"',
    'API_URL="http://127.0.0.1:54321"',
    'PUBLISHABLE_KEY="public"'
  ])("fails closed for remote, missing, or stopped-stack output", (status) => {
    expect(() => localPublicEnvironmentFromStatus(status)).toThrow(/local Supabase/i)
  })

  it("launches the requested child with public values without logging the key", () => {
    const spawnCommand = vi.fn(() => 0)
    const log = vi.fn()

    const exitCode = runWithLocalSupabase(["node", "child.mjs", "--flag"], {
      readStatus: () => localStatus,
      spawnCommand,
      inheritedEnvironment: { PATH: "test-path", UNRELATED: "kept" },
      log
    })

    expect(exitCode).toBe(0)
    expect(spawnCommand).toHaveBeenCalledWith(
      "node",
      ["child.mjs", "--flag"],
      expect.objectContaining({
        PATH: "test-path",
        UNRELATED: "kept",
        SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_PUBLISHABLE_KEY: publishableKey,
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
        VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey
      })
    )
    expect(log).toHaveBeenCalledWith("Using ephemeral loopback Supabase public configuration.")
    expect(log.mock.calls.flat().join(" ")).not.toContain(publishableKey)
  })

  it("requires a child command and propagates its failure code", () => {
    expect(() =>
      runWithLocalSupabase([], {
        readStatus: () => localStatus,
        spawnCommand: vi.fn(() => 0),
        inheritedEnvironment: {},
        log: vi.fn()
      })
    ).toThrow(/child command/i)

    expect(
      runWithLocalSupabase(["node", "child.mjs"], {
        readStatus: () => localStatus,
        spawnCommand: () => 7,
        inheritedEnvironment: {},
        log: vi.fn()
      })
    ).toBe(7)
  })
})
