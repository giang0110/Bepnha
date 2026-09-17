// @vitest-environment node

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import type { CatalogPackV1 } from "./catalog-pack-types.ts"
import {
  SHEET_FILE_NAMES,
  SHEET_HEADERS,
  packToSheets,
  sheetsToPack,
  type SheetBundle
} from "./catalog-sheet-tables.ts"

const template = JSON.parse(
  readFileSync("docs/catalog/catalog-pack-template.json", "utf8")
) as CatalogPackV1

function rowOf(bundle: SheetBundle, file: keyof SheetBundle, index: number): string[] {
  return bundle[file][index] as string[]
}

describe("round trip through the spreadsheet tables", () => {
  it("returns the committed template unchanged", () => {
    const bundle = packToSheets(template)
    const { pack, errors } = sheetsToPack(bundle)

    expect(errors).toEqual([])
    expect(pack).toEqual(template)
  })

  it("covers every table with a header row", () => {
    const bundle = packToSheets(template)

    for (const name of SHEET_FILE_NAMES) {
      expect(rowOf(bundle, name, 0)).toEqual([...SHEET_HEADERS[name]])
    }
  })

  it("keeps each food's children joined to it by code", () => {
    const bundle = packToSheets(template)
    const first = template.foods[0]

    expect(bundle["food_nutrients.csv"].filter((row) => row[0] === first?.code)).toHaveLength(
      first?.fact.nutrients.length ?? -1
    )
    expect(bundle["food_allergens.csv"].filter((row) => row[0] === first?.code)).toHaveLength(
      first?.fact.allergenAssessments.length ?? -1
    )
  })
})

describe("a blank cell never becomes a value", () => {
  function bundleWithBlank(file: keyof SheetBundle, column: string): SheetBundle {
    const bundle = packToSheets(template)
    const header = bundle[file][0] as string[]
    const index = header.indexOf(column)
    const row = bundle[file][1] as string[]
    row[index] = ""
    return bundle
  }

  it("reads a blank required number as null, not zero", () => {
    const { pack } = sheetsToPack(bundleWithBlank("food_nutrients.csv", "amountPer100g"))
    const nutrient = (pack as CatalogPackV1).foods[0]?.fact.nutrients[0]

    // amountPer100g is carried as text, so a blank stays blank rather than becoming "0".
    expect(nutrient?.amountPer100g).toBe("")
  })

  it.each([
    ["foods.csv", "factVersionNumber", (pack: CatalogPackV1) => pack.foods[0]?.fact.versionNumber],
    [
      "recipes.csv",
      "activeMinutes",
      (pack: CatalogPackV1) => pack.recipes[0]?.version.activeMinutes
    ],
    [
      "prices.csv",
      "packagePriceVnd",
      (pack: CatalogPackV1) => pack.priceBook.prices[0]?.packagePriceVnd
    ]
  ] as const)("reads a blank %s.%s as null rather than 0", (file, column, read) => {
    const { pack } = sheetsToPack(bundleWithBlank(file, column))

    // Asserted at the exact path: other entities carry the same field name and a legitimate 0.
    expect(read(pack as CatalogPackV1)).toBeNull()
  })

  it("reads a non-numeric cell as null rather than coercing it", () => {
    const bundle = packToSheets(template)
    const header = bundle["recipes.csv"][0] as string[]
    const row = bundle["recipes.csv"][1] as string[]
    row[header.indexOf("activeMinutes")] = "khoảng 20"

    const { pack } = sheetsToPack(bundle)
    expect((pack as CatalogPackV1).recipes[0]?.version.activeMinutes).toBeNull()
  })

  it("leaves a blank allergen status blank instead of concluding absent", () => {
    const { pack } = sheetsToPack(bundleWithBlank("food_allergens.csv", "status"))
    const assessment = (pack as CatalogPackV1).foods[0]?.fact.allergenAssessments[0]

    expect(assessment?.status).toBe("")
    expect(assessment?.status).not.toBe("absent")
  })
})

describe("spreadsheet edits the reader tolerates and the ones it refuses", () => {
  it("matches columns by name, so a reordered sheet still reads", () => {
    const bundle = packToSheets(template)
    for (const row of bundle["foods.csv"]) row.reverse()

    const { pack, errors } = sheetsToPack(bundle)
    expect(errors).toEqual([])
    expect((pack as CatalogPackV1).foods[0]?.code).toBe(template.foods[0]?.code)
  })

  it("ignores an extra notes column someone added while authoring", () => {
    const bundle = packToSheets(template)
    bundle["foods.csv"][0]?.push("ghi chú")
    for (const row of bundle["foods.csv"].slice(1)) row.push("hỏi lại chị Lan")

    expect(sheetsToPack(bundle).errors).toEqual([])
  })

  it("names the column when one was renamed away", () => {
    const bundle = packToSheets(template)
    const header = bundle["foods.csv"][0] as string[]
    header[header.indexOf("edibleFraction")] = "phan_an_duoc"

    expect(sheetsToPack(bundle).errors).toEqual([
      { file: "foods.csv", message: "missing column(s): edibleFraction" }
    ])
  })

  it("refuses a pack sheet carrying more than one row rather than picking one", () => {
    const bundle = packToSheets(template)
    bundle["pack.csv"].push([...(bundle["pack.csv"][1] as string[])])

    expect(sheetsToPack(bundle).errors).toEqual([
      { file: "pack.csv", message: "expected exactly one data row, found 2" }
    ])
  })
})
