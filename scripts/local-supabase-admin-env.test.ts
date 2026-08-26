// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

import {
  localAdminEnvironmentFromStatus,
  runWithLocalSupabaseAdmin
} from "./local-supabase-admin-env.mjs"

const secretKey = "sb_secret_local-test-value"
const status = `API_URL="http://127.0.0.1:54321"
PUBLISHABLE_KEY="sb_publishable_local-test-value"
SECRET_KEY="${secretKey}"
`

describe("local Supabase administrator environment", () => {
  test("maps loopback public and server-only secret values", () => {
    expect(localAdminEnvironmentFromStatus(status)).toEqual({
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local-test-value",
      SUPABASE_SECRET_KEY: secretKey
    })
  })

  test.each([
    'API_URL="https://project.supabase.co"\nPUBLISHABLE_KEY="public"\nSECRET_KEY="secret"',
    'API_URL="http://192.168.1.2:54321"\nPUBLISHABLE_KEY="public"\nSECRET_KEY="secret"',
    'API_URL="http://127.0.0.1:54321"\nPUBLISHABLE_KEY="public"',
    'PUBLISHABLE_KEY="public"\nSECRET_KEY="secret"'
  ])("fails closed for remote, missing stack, or missing secret", (candidate) => {
    expect(() => localAdminEnvironmentFromStatus(candidate)).toThrow(/local Supabase/i)
  })

  test("passes the secret only to the named child without logging it", () => {
    const spawnCommand =
      vi.fn<(command: string, args: string[], environment: NodeJS.ProcessEnv) => number>()
    spawnCommand.mockReturnValue(0)
    const log = vi.fn()

    const result = runWithLocalSupabaseAdmin(["node", "child.mjs"], {
      readStatus: () => status,
      spawnCommand,
      inheritedEnvironment: { PATH: "test", VITE_SUPABASE_SECRET_KEY: "remove-me" },
      log
    })

    expect(result).toBe(0)
    expect(spawnCommand).toHaveBeenCalledWith(
      "node",
      ["child.mjs"],
      expect.objectContaining({
        PATH: "test",
        SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local-test-value",
        SUPABASE_SECRET_KEY: secretKey
      })
    )
    const childEnvironment = spawnCommand.mock.calls[0]?.[2]
    expect(childEnvironment).not.toHaveProperty("VITE_SUPABASE_SECRET_KEY")
    expect(log.mock.calls.flat().join(" ")).not.toContain(secretKey)
  })

  test("redacts child-launch failures and requires a child command", () => {
    expect(() => runWithLocalSupabaseAdmin([], { readStatus: () => status })).toThrow(
      /child command/i
    )
    expect(() =>
      runWithLocalSupabaseAdmin(["node", "child.mjs"], {
        readStatus: () => status,
        spawnCommand: () => {
          throw new Error(`failure ${secretKey}`)
        },
        inheritedEnvironment: {},
        log: vi.fn()
      })
    ).toThrow("Unable to launch local administrator verification child command.")
  })
})
