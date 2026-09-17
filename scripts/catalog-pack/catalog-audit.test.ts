// @vitest-environment node

import { describe, expect, it } from "vitest"

import { allergenFindings, energyFindings, provenanceFindings } from "./catalog-audit.ts"

const FCT = "https://www.fao.org/VTN_FCT_2007.pdf"

function nutrients(food: string, values: Record<string, string>, provenance = FCT) {
  return Object.entries(values).map(([nutrientCode, amountPer100g]) => ({
    foodCode: food,
    nutrientCode,
    amountPer100g,
    provenance
  }))
}

describe("energy consistency", () => {
  it("accepts figures that satisfy Atwater, as real analysis does", () => {
    // 20g protein + 0g carb + 8g fat -> 152 kcal
    const rows = nutrients("ga_ta", {
      energy_kcal: "149",
      protein_g: "20.8",
      carbohydrate_g: "0",
      fat_g: "7.3"
    })

    expect(energyFindings(rows)).toEqual([])
  })

  it("flags an energy figure the macronutrients cannot produce", () => {
    const rows = nutrients("bia_dat", {
      energy_kcal: "400",
      protein_g: "2",
      carbohydrate_g: "3",
      fat_g: "1"
    })

    expect(energyFindings(rows)[0]).toMatchObject({
      code: "ENERGY_INCONSISTENT",
      subject: "bia_dat"
    })
  })

  it("says nothing when a macronutrient is missing, rather than guessing", () => {
    expect(energyFindings(nutrients("x", { energy_kcal: "100", protein_g: "" }))).toEqual([])
  })
})

describe("allergen conclusions", () => {
  const ten = [
    "peanut",
    "tree_nut",
    "dairy",
    "egg",
    "soy",
    "wheat",
    "fish",
    "crustacean",
    "mollusc",
    "sesame"
  ]
  const assess = (food: string, status: string, overrides: Record<string, string> = {}) =>
    ten.map((allergenCode) => ({
      foodCode: food,
      allergenCode,
      status: overrides[allergenCode] ?? status,
      provenance: "lý do"
    }))

  it("refuses a fish that is not marked as containing fish", () => {
    const findings = allergenFindings(
      [{ code: "ca_loc", categoryCode: "fish" }],
      assess("ca_loc", "unknown")
    )

    expect(findings[0]).toMatchObject({ code: "ALLERGEN_CONTRADICTS_CATEGORY", subject: "ca_loc" })
  })

  it.each([
    ["fish", "fish"],
    ["crustacean", "crustacean"],
    ["mollusc", "mollusc"],
    ["egg", "egg"],
    ["tofu", "soy"]
  ])("accepts a %s marked as containing %s", (categoryCode, allergen) => {
    const findings = allergenFindings(
      [{ code: "x", categoryCode }],
      assess("x", "unknown", { [allergen]: "contains" })
    )

    expect(findings).toEqual([])
  })

  it("reports a food missing some of the ten assessments", () => {
    const findings = allergenFindings(
      [{ code: "gao_te", categoryCode: "staple" }],
      assess("gao_te", "unknown").slice(0, 7)
    )

    expect(findings[0]).toMatchObject({ code: "ALLERGEN_ROWS_MISSING" })
  })

  it("flags many absences citing one source, the signature of a bulk fill", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      foodCode: `food_${index}`,
      allergenCode: "peanut",
      status: "absent",
      provenance: "kiểm tra chung"
    }))

    const findings = allergenFindings([], rows)
    expect(findings.some((finding) => finding.code === "ABSENT_BULK_FILLED")).toBe(true)
  })

  it("does not flag absences that were each sourced separately", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      foodCode: `food_${index}`,
      allergenCode: "peanut",
      status: "absent",
      provenance: `https://example.test/food/${index}`
    }))

    expect(allergenFindings([], rows)).toEqual([])
  })
})

describe("provenance", () => {
  it("demands a citation for a conclusion", () => {
    const findings = provenanceFindings(
      [{ foodCode: "x", allergenCode: "peanut", status: "absent", provenance: "đã kiểm tra" }],
      "provenance",
      "allergen"
    )

    expect(findings[0]).toMatchObject({ code: "PROVENANCE_NOT_CITABLE" })
  })

  it("asks only for a reason on an unknown, never a citation", () => {
    // Demanding a URL here would push an author towards inventing one.
    const findings = provenanceFindings(
      [
        {
          foodCode: "x",
          allergenCode: "peanut",
          status: "unknown",
          provenance: "chưa có căn cứ về nhiễm chéo"
        }
      ],
      "provenance",
      "allergen"
    )

    expect(findings).toEqual([])
  })

  it("accepts a national food composition table without comment", () => {
    expect(
      provenanceFindings(nutrients("x", { energy_kcal: "1" }), "provenance", "nutrition")
    ).toEqual([])
  })

  it("warns when a figure rests on an aggregator rather than a primary table", () => {
    const rows = nutrients("x", { energy_kcal: "1" }, "https://foodstruct.com/food/whatever")

    expect(provenanceFindings(rows, "provenance", "nutrition")[0]).toMatchObject({
      code: "PROVENANCE_SECONDARY",
      severity: "warning"
    })
  })

  it("treats an empty provenance on a conclusion as an error", () => {
    const rows = nutrients("x", { energy_kcal: "1" }, "")

    expect(provenanceFindings(rows, "provenance", "nutrition")[0]).toMatchObject({
      code: "PROVENANCE_MISSING",
      severity: "error"
    })
  })
})
