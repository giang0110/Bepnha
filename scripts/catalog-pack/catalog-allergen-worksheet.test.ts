// @vitest-environment node

import { describe, expect, it } from "vitest"

import { WORKSHEET_COLUMNS, applyWorksheet, buildWorksheet } from "./catalog-allergen-worksheet.ts"

const ALLERGENS = WORKSHEET_COLUMNS.slice(3, 13)

const foods = [
  { code: "ca_loc", nameVi: "Cá lóc", categoryCode: "fish" },
  { code: "gao_te", nameVi: "Gạo tẻ", categoryCode: "staple" }
]

function assessments(overrides: Record<string, { status: string; provenance: string }> = {}) {
  return foods.flatMap((food) =>
    ALLERGENS.map((allergenCode) => {
      const key = `${food.code}.${allergenCode}`
      return {
        foodCode: food.code,
        allergenCode,
        status: overrides[key]?.status ?? "unknown",
        provenance: overrides[key]?.provenance ?? "chưa có căn cứ"
      }
    })
  )
}

const worksheetRows = (rows: string[][]) =>
  rows.slice(1).map((row) => Object.fromEntries(WORKSHEET_COLUMNS.map((c, i) => [c, row[i] ?? ""])))

describe("buildWorksheet", () => {
  it("gives one row per food with the ten allergens as columns", () => {
    const rows = buildWorksheet(foods, assessments())

    expect(rows[0]).toEqual([...WORKSHEET_COLUMNS])
    expect(rows).toHaveLength(3)
  })

  it("shows an unknown as a blank waiting to be answered, not as a word", () => {
    const [row] = worksheetRows(buildWorksheet(foods, assessments()))

    expect(row?.["peanut"]).toBe("")
  })

  it("carries an existing conclusion and its citation forward", () => {
    const rows = worksheetRows(
      buildWorksheet(
        foods,
        assessments({ "ca_loc.fish": { status: "contains", provenance: "https://example.test/f" } })
      )
    )

    expect(rows[0]).toMatchObject({ fish: "contains", reason: "https://example.test/f" })
  })
})

describe("applyWorksheet", () => {
  const base = assessments()
  const sheet = worksheetRows(buildWorksheet(foods, base))

  it("changes nothing when the worksheet comes back untouched", () => {
    const result = applyWorksheet(sheet, base)

    expect(result.refusals).toEqual([])
    expect(result.filled).toBe(0)
    expect(result.rows.slice(1).map((row) => row[2])).toEqual(base.map((row) => row.status))
  })

  it("refuses a conclusion with no reason, and writes nothing at all", () => {
    const edited = sheet.map((row, index) => (index === 0 ? { ...row, peanut: "absent" } : row))
    const result = applyWorksheet(edited, base)

    expect(result.refusals).toEqual(["ca_loc: concludes peanut with no reason"])
    expect(result.rows).toEqual([])
  })

  it("refuses a value that is not a status", () => {
    const edited = sheet.map((row, index) =>
      index === 0 ? { ...row, peanut: "chắc là không", reason: "r" } : row
    )

    expect(applyWorksheet(edited, base).refusals[0]).toContain("is not a status")
  })

  it("writes a conclusion together with the food's reason", () => {
    const edited = sheet.map((row, index) =>
      index === 0
        ? { ...row, peanut: "absent", reason: "cá tươi nguyên con, chợ X 2026-09-20" }
        : row
    )
    const result = applyWorksheet(edited, base)

    expect(result.filled).toBe(1)
    expect(result.rows.find((row) => row[0] === "ca_loc" && row[1] === "peanut")).toEqual([
      "ca_loc",
      "peanut",
      "absent",
      "cá tươi nguyên con, chợ X 2026-09-20"
    ])
  })

  it("keeps a specific citation rather than overwriting it with the food-wide reason", () => {
    const withCitation = assessments({
      "ca_loc.fish": { status: "contains", provenance: "https://example.test/fish" }
    })
    const edited = worksheetRows(buildWorksheet(foods, withCitation)).map((row) => ({
      ...row,
      reason: "lý do chung cho cả con cá"
    }))

    const row = applyWorksheet(edited, withCitation).rows.find(
      (candidate) => candidate[0] === "ca_loc" && candidate[1] === "fish"
    )
    expect(row?.[3]).toBe("https://example.test/fish")
  })

  it("leaves a blank as the unknown it was, never inventing an answer", () => {
    const result = applyWorksheet(sheet, base)
    const row = result.rows.find(
      (candidate) => candidate[0] === "gao_te" && candidate[1] === "wheat"
    )

    expect(row?.[2]).toBe("unknown")
  })
})
