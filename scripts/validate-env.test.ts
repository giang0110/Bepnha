// @vitest-environment node

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { parseEnvFile, validateClientEnvironment } from "./validate-env.mjs"

const validEnvironment = {
  SUPABASE_PUBLISHABLE_KEY: "server-public-placeholder",
  SUPABASE_URL: "https://example.test",
  VITE_SUPABASE_URL: "https://example.test",
  VITE_SUPABASE_PUBLISHABLE_KEY: "local-public-placeholder"
}

function withoutEnvironmentKey(key: keyof typeof validEnvironment): Record<string, string> {
  return Object.fromEntries(
    Object.entries(validEnvironment).filter(([entryKey]) => entryKey !== key)
  )
}

describe("parseEnvFile", () => {
  it("parses documented records while ignoring comments and blank lines", () => {
    expect(parseEnvFile("# comment\n\nONE=value\nTWO=second value\n")).toEqual({
      ONE: "value",
      TWO: "second value"
    })
  })

  it("rejects duplicate and malformed records", () => {
    expect(() => parseEnvFile("ONE=value\nONE=other\n")).toThrow("Duplicate environment key: ONE")
    expect(() => parseEnvFile("ONE\n")).toThrow("Malformed environment record on line 1")
  })
})

describe("validateClientEnvironment", () => {
  it("accepts all four expected non-empty public values when both URLs are HTTP(S)", () => {
    expect(() => validateClientEnvironment(validEnvironment)).not.toThrow()
    expect(() =>
      validateClientEnvironment({
        ...validEnvironment,
        VITE_SUPABASE_URL: "http://127.0.0.1:54321"
      })
    ).not.toThrow()
  })

  it("fails a missing URL with a named validation error", () => {
    expect(() => validateClientEnvironment(withoutEnvironmentKey("VITE_SUPABASE_URL"))).toThrow(
      expect.objectContaining({
        name: "EnvironmentValidationError",
        message: "Missing VITE_SUPABASE_URL"
      })
    )
  })

  it("fails a malformed URL", () => {
    expect(() =>
      validateClientEnvironment({ ...validEnvironment, VITE_SUPABASE_URL: "not-a-url" })
    ).toThrow("VITE_SUPABASE_URL must be an HTTP(S) URL")
  })

  it("fails a missing publishable key", () => {
    expect(() =>
      validateClientEnvironment(withoutEnvironmentKey("VITE_SUPABASE_PUBLISHABLE_KEY"))
    ).toThrow("Missing VITE_SUPABASE_PUBLISHABLE_KEY")
  })

  it.each([
    ["SUPABASE_URL", "Missing SUPABASE_URL"],
    ["SUPABASE_PUBLISHABLE_KEY", "Missing SUPABASE_PUBLISHABLE_KEY"]
  ])("fails missing server value %s", (key, message) => {
    expect(() =>
      validateClientEnvironment(withoutEnvironmentKey(key as keyof typeof validEnvironment))
    ).toThrow(message)
  })

  it("rejects a malformed server URL", () => {
    expect(() =>
      validateClientEnvironment({ ...validEnvironment, SUPABASE_URL: "file:///tmp/supabase" })
    ).toThrow("SUPABASE_URL must be an HTTP(S) URL")
  })

  it.each([
    "VITE_SUPABASE_SECRET_KEY",
    "VITE_SUPABASE_SERVICE_ROLE_KEY",
    "VITE_PRIVATE_KEY",
    "vItE_CLIENT_SECRET",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SERVER_PRIVATE_KEY"
  ])("rejects suspicious key name %s", (forbiddenKey) => {
    expect(() =>
      validateClientEnvironment({ ...validEnvironment, [forbiddenKey]: "synthetic-value" })
    ).toThrow(`Forbidden client environment key: ${forbiddenKey}`)
  })

  it("accepts the committed public example", async () => {
    const contents = await readFile(resolve(import.meta.dirname, "../.env.example"), "utf8")

    expect(() => validateClientEnvironment(parseEnvFile(contents))).not.toThrow()
  })
})
