// @vitest-environment node

import { describe, expect, it } from "vitest"

import { parseSheetArgs } from "./catalog-sheet-cli.ts"

describe("parseSheetArgs", () => {
  it("accepts an export invocation", () => {
    expect(parseSheetArgs(["export", "--pack", "p.json", "--dir", "csv"])).toEqual({
      ok: true,
      value: { mode: "export", pack: "p.json", dir: "csv", out: null }
    })
  })

  it("accepts an import invocation", () => {
    expect(parseSheetArgs(["import", "--dir", "csv", "--out", "p.json"])).toEqual({
      ok: true,
      value: { mode: "import", pack: null, dir: "csv", out: "p.json" }
    })
  })

  it.each([
    ["no mode", []],
    ["an unknown mode", ["publish", "--dir", "csv"]],
    ["export without a pack", ["export", "--dir", "csv"]],
    ["import without an output", ["import", "--dir", "csv"]],
    ["no directory", ["export", "--pack", "p.json"]],
    ["an unknown flag", ["export", "--pack", "p.json", "--dir", "csv", "--force", "yes"]],
    ["a repeated flag", ["export", "--pack", "a.json", "--pack", "b.json", "--dir", "csv"]],
    ["a flag with no value", ["export", "--pack", "--dir", "csv"]]
  ])("refuses %s", (_name, argv) => {
    expect(parseSheetArgs(argv).ok).toBe(false)
  })

  it("never offers a flag that would push to production", () => {
    const usage = parseSheetArgs([]) as { ok: false; message: string }

    expect(usage.message).not.toMatch(/publish|apply|production|--url|--key/iu)
    expect(usage.message).toMatch(/catalog:validate/u)
  })
})
