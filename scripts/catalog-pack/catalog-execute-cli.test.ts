import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

import { parseExecuteArgs, readExecuteEnvironment, readJournal } from "./catalog-execute-cli.ts"
import type { CatalogMutationPlanV1 } from "./catalog-mutation-types.ts"

const plan = { inputSha256: "a".repeat(64) } as CatalogMutationPlanV1

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "bepnha-execute-"))
}

describe("parseExecuteArgs", () => {
  test("reads both paths and defaults to the cautious flags", () => {
    expect(parseExecuteArgs(["--plan", "p.json", "--journal", "j.json"])).toEqual({
      ok: true,
      value: { plan: "p.json", journal: "j.json", resume: false, dryRun: false }
    })
  })

  test("reads the flags in any position", () => {
    const result = parseExecuteArgs([
      "--dry-run",
      "--plan",
      "p.json",
      "--resume",
      "--journal",
      "j.json"
    ])

    expect(result.ok && result.value).toEqual({
      plan: "p.json",
      journal: "j.json",
      resume: true,
      dryRun: true
    })
  })

  test.each([
    [[], "both paths missing"],
    [["--plan", "p.json"], "no journal"],
    [["--journal", "j.json"], "no plan"],
    [["--plan", "a", "--plan", "b", "--journal", "j"], "a repeated flag"],
    [["--plan", "--journal", "j.json"], "a flag where a path belongs"],
    [["--unknown", "x"], "an unknown flag"]
  ])("refuses %j (%s)", (argv) => {
    expect(parseExecuteArgs(argv).ok).toBe(false)
  })
})

describe("readExecuteEnvironment", () => {
  test("accepts a complete https configuration", () => {
    const result = readExecuteEnvironment({
      BEPNHA_ADMIN_ENDPOINT: "https://example.test/api/admin/catalog",
      BEPNHA_ADMIN_ACCESS_TOKEN: "token"
    })

    expect(result).toEqual({
      ok: true,
      value: { endpoint: "https://example.test/api/admin/catalog", accessToken: "token" }
    })
  })

  test.each([
    [{}, /ENDPOINT is not set/],
    [{ BEPNHA_ADMIN_ENDPOINT: "https://x.test" }, /ACCESS_TOKEN is not set/],
    [{ BEPNHA_ADMIN_ENDPOINT: "", BEPNHA_ADMIN_ACCESS_TOKEN: "t" }, /ENDPOINT is not set/],
    [{ BEPNHA_ADMIN_ENDPOINT: "https://x.test", BEPNHA_ADMIN_ACCESS_TOKEN: "" }, /ACCESS_TOKEN/]
  ])("refuses an incomplete environment rather than sending an anonymous request", (env, match) => {
    const result = readExecuteEnvironment(env)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(match)
  })

  test("refuses to send an admin token over plain http", () => {
    const result = readExecuteEnvironment({
      BEPNHA_ADMIN_ENDPOINT: "http://example.test/api/admin/catalog",
      BEPNHA_ADMIN_ACCESS_TOKEN: "token"
    })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/must be https/)
  })
})

describe("readJournal", () => {
  test("a fresh run with no journal file starts from nothing", () => {
    expect(readJournal(join(scratch(), "absent.json"), plan, false)).toEqual({
      ok: true,
      value: undefined
    })
  })

  test("refuses to overwrite an existing journal unless resuming", () => {
    const path = join(scratch(), "journal.json")
    writeFileSync(path, JSON.stringify({ planInputSha256: plan.inputSha256 }), "utf8")

    const result = readJournal(path, plan, false)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/pass --resume/)
  })

  test("resumes a journal that belongs to this plan", () => {
    const path = join(scratch(), "journal.json")
    const journal = { planInputSha256: plan.inputSha256, allocations: {}, completed: [] }
    writeFileSync(path, JSON.stringify(journal), "utf8")

    expect(readJournal(path, plan, true)).toEqual({ ok: true, value: journal })
  })

  test("refuses a journal from a different plan, which would apply the wrong operations", () => {
    const path = join(scratch(), "journal.json")
    writeFileSync(path, JSON.stringify({ planInputSha256: "b".repeat(64) }), "utf8")

    const result = readJournal(path, plan, true)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/different plan/)
  })

  test("refuses an unreadable journal rather than starting over on top of it", () => {
    const path = join(scratch(), "journal.json")
    writeFileSync(path, "{ not json", "utf8")

    const result = readJournal(path, plan, true)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/not valid JSON/)
  })
})
