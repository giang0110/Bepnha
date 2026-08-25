// @vitest-environment node

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { parseEnvFile, validateClientEnvironment } from "./validate-env.mjs"

const validEnvironment = {
  VITE_SUPABASE_URL: "https://example.test",
  VITE_SUPABASE_PUBLISHABLE_KEY: "local-public-placeholder"
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
  it("accepts both expected non-empty public values when the URL is HTTP(S)", () => {
    expect(() => validateClientEnvironment(validEnvironment)).not.toThrow()
    expect(() =>
      validateClientEnvironment({
        ...validEnvironment,
        VITE_SUPABASE_URL: "http://127.0.0.1:54321"
      })
    ).not.toThrow()
  })

  it("fails a missing URL with a named validation error", () => {
    expect(() =>
      validateClientEnvironment({ VITE_SUPABASE_PUBLISHABLE_KEY: "local-public-placeholder" })
    ).toThrow(
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
    expect(() => validateClientEnvironment({ VITE_SUPABASE_URL: "https://example.test" })).toThrow(
      "Missing VITE_SUPABASE_PUBLISHABLE_KEY"
    )
  })

  it.each([
    "VITE_SUPABASE_SECRET_KEY",
    "VITE_SUPABASE_SERVICE_ROLE_KEY",
    "VITE_PRIVATE_KEY",
    "vItE_CLIENT_SECRET"
  ])("rejects suspicious client key name %s", (forbiddenKey) => {
    expect(() =>
      validateClientEnvironment({ ...validEnvironment, [forbiddenKey]: "synthetic-value" })
    ).toThrow(`Forbidden client environment key: ${forbiddenKey}`)
  })

  it("accepts the committed public example", async () => {
    const contents = await readFile(resolve(import.meta.dirname, "../.env.example"), "utf8")

    expect(() => validateClientEnvironment(parseEnvFile(contents))).not.toThrow()
  })
})
