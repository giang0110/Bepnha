// @vitest-environment node

import { describe, expect, it } from "vitest"

import { findSecretFindings } from "./check-secrets.mjs"

const assignment = (name: string, value: string) => `${name}=${value}`
const secretName = (suffix: string) => `SUPABASE_${suffix}`
const syntheticToken = (prefix: string) => `${prefix}${"x".repeat(32)}`

describe("findSecretFindings", () => {
  it("detects PEM private-key headers", () => {
    const pemHeader = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ")

    expect(findSecretFindings("config.txt", pemHeader)).toContain("pem-private-key")
  })

  it("detects non-empty sensitive Supabase and VITE assignments", () => {
    const contents = [
      assignment(secretName("SERVICE_ROLE_KEY"), "synthetic-value"),
      assignment(secretName("SECRET_KEY"), "synthetic-value"),
      assignment("VITE_" + "CLIENT_SECRET", "synthetic-value")
    ].join("\n")

    expect(findSecretFindings("config.env", contents)).toContain("sensitive-environment-assignment")
  })

  it("detects committed Gemini server and browser key assignments", () => {
    for (const name of ["GEMINI_API_KEY", "VITE_GEMINI_API_KEY"]) {
      expect(findSecretFindings("config.env", assignment(name, "synthetic-value"))).toContain(
        "sensitive-environment-assignment"
      )
    }
  })

  it("detects mixed-case non-empty VITE secret assignments", () => {
    const contents = assignment("vItE_" + "CLIENT_SECRET", "synthetic-value")

    expect(findSecretFindings("config.env", contents)).toContain("sensitive-environment-assignment")
  })

  it.each(["VITE_" + "SUPABASE_SERVICE_ROLE_KEY", "vItE_" + "PRIVATE_KEY"])(
    "detects non-empty forbidden client assignment %s",
    (name) => {
      expect(findSecretFindings("config.env", assignment(name, "synthetic-value"))).toContain(
        "sensitive-environment-assignment"
      )
    }
  )

  it("detects common credential-like token prefixes", () => {
    expect(findSecretFindings("config.txt", syntheticToken("gh" + "p_"))).toContain(
      "credential-token"
    )
  })

  it("does not flag policy prose, empty assignments, or a public placeholder", () => {
    const contents = [
      "Do not commit SUPABASE_SECRET_KEY values.",
      "Configure GEMINI_API_KEY in server runtime only.",
      assignment(secretName("SECRET_KEY"), ""),
      assignment("GEMINI_API_KEY", ""),
      assignment("VITE_GEMINI_API_KEY", ""),
      assignment("VITE_" + "CLIENT_SECRET", ""),
      assignment("VITE_SUPABASE_PUBLISHABLE_KEY", "replace-with-local-publishable-key")
    ].join("\n")

    expect(findSecretFindings("docs/policy.txt", contents)).toEqual([])
  })

  it("allows the server secret variable name in documentation but never a committed value", () => {
    const variableName = secretName("SECRET_KEY")

    expect(
      findSecretFindings("README.md", `Configure ${variableName} in server runtime only.`)
    ).toEqual([])
    expect(findSecretFindings("config.env", assignment(variableName, "synthetic-value"))).toContain(
      "sensitive-environment-assignment"
    )
  })
})
