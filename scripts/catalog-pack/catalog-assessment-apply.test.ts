import { describe, expect, test } from "vitest"

import { applyAssessments, ASSESSMENT_TO_STATUS } from "./catalog-assessment-apply.ts"

type Row = Record<string, string>

function survey(overrides: Partial<Row> = {}): Row {
  return {
    foodCode: "ga_ta",
    allergenCode: "peanut",
    assessment: "not_intrinsic_but_cross_contact_unverified",
    evidenceUrls: "",
    rationale: "Chicken is not the peanut category; handling is unverified.",
    ...overrides
  }
}

function catalogRow(overrides: Partial<Row> = {}): Row {
  return {
    foodCode: "ga_ta",
    allergenCode: "peanut",
    status: "unknown",
    provenance: "No verified evidence; conservative unknown.",
    ...overrides
  }
}

describe("the mapping itself", () => {
  test("covers the survey's three conclusions and no more", () => {
    expect(Object.keys(ASSESSMENT_TO_STATUS).sort()).toEqual([
      "confirmed_contains",
      "formulation_or_source_dependent",
      "not_intrinsic_but_cross_contact_unverified"
    ])
  })

  test("cannot produce absent, which needs evidence no survey of a generic food can give", () => {
    expect(Object.values(ASSESSMENT_TO_STATUS)).not.toContain("absent")
  })

  test("never produces unknown either, because every conclusion is an answer", () => {
    expect(Object.values(ASSESSMENT_TO_STATUS)).not.toContain("unknown")
  })
})

describe("applyAssessments", () => {
  test("maps a not-an-ingredient conclusion to the status the household decides about", () => {
    const result = applyAssessments([survey()], [catalogRow()])

    expect(result.refusals).toEqual([])
    expect(result.rows[1]).toEqual([
      "ga_ta",
      "peanut",
      "cross_contact_unverified",
      "Chicken is not the peanut category; handling is unverified."
    ])
    expect(result.changed).toBe(1)
  })

  test("maps a confirmed ingredient to contains and carries its sources", () => {
    const result = applyAssessments(
      [
        survey({
          foodCode: "ca_loc",
          allergenCode: "fish",
          assessment: "confirmed_contains",
          evidenceUrls: "https://example.test/a|https://example.test/b"
        })
      ],
      [catalogRow({ foodCode: "ca_loc", allergenCode: "fish" })]
    )

    expect(result.rows[1]).toEqual([
      "ca_loc",
      "fish",
      "contains",
      "https://example.test/a|https://example.test/b"
    ])
  })

  test("maps a product that varies to may_contain", () => {
    const result = applyAssessments(
      [
        survey({
          foodCode: "nuoc_tuong",
          allergenCode: "wheat",
          assessment: "formulation_or_source_dependent",
          evidenceUrls: "https://example.test/soy-sauce"
        })
      ],
      [catalogRow({ foodCode: "nuoc_tuong", allergenCode: "wheat" })]
    )

    expect(result.rows[1]?.[2]).toBe("may_contain")
  })

  test("counts each status it wrote", () => {
    const result = applyAssessments(
      [
        survey(),
        survey({
          allergenCode: "fish",
          assessment: "confirmed_contains",
          evidenceUrls: "https://x.test/a"
        })
      ],
      [catalogRow(), catalogRow({ allergenCode: "fish" })]
    )

    expect(result.statusCounts).toEqual({ cross_contact_unverified: 1, contains: 1 })
  })
})

describe("what applyAssessments refuses", () => {
  test("a pair the survey never covered", () => {
    const result = applyAssessments([survey()], [catalogRow(), catalogRow({ allergenCode: "soy" })])

    expect(result.refusals).toEqual(["ga_ta.soy: the survey does not cover this pair"])
    expect(result.rows).toEqual([])
  })

  test("a conclusion it does not recognise", () => {
    const result = applyAssessments([survey({ assessment: "probably_fine" })], [catalogRow()])

    expect(result.refusals[0]).toMatch(/"probably_fine" is not a survey conclusion/)
    expect(result.rows).toEqual([])
  })

  test("a survey that answers the same pair twice", () => {
    const result = applyAssessments([survey(), survey()], [catalogRow()])

    expect(result.refusals[0]).toMatch(/answers this pair twice/)
  })

  test("a survey that disagrees with a conclusion already in the catalog", () => {
    const result = applyAssessments([survey()], [catalogRow({ status: "contains" })])

    expect(result.refusals[0]).toMatch(/the catalog says "contains" and the survey says/)
    expect(result.rows).toEqual([])
  })

  test("a claim about the food with nothing behind it", () => {
    const result = applyAssessments(
      [survey({ assessment: "confirmed_contains", evidenceUrls: "" })],
      [catalogRow()]
    )

    expect(result.refusals[0]).toMatch(/is a claim about the food and the survey cites nothing/)
    expect(result.rows).toEqual([])
  })

  test("writes nothing at all when a single pair is refused", () => {
    const result = applyAssessments(
      [survey(), survey({ allergenCode: "soy", assessment: "nonsense" })],
      [catalogRow(), catalogRow({ allergenCode: "soy" })]
    )

    expect(result.rows).toEqual([])
    expect(result.changed).toBe(0)
    expect(result.statusCounts).toEqual({})
  })
})

describe("what applyAssessments preserves", () => {
  test("a citation already on the row for this same conclusion", () => {
    const result = applyAssessments(
      [
        survey({
          allergenCode: "fish",
          assessment: "confirmed_contains",
          evidenceUrls: "https://generic.test/policy"
        })
      ],
      [
        catalogRow({
          allergenCode: "fish",
          status: "contains",
          provenance: "https://specific.test/this-exact-fish"
        })
      ]
    )

    expect(result.rows[1]?.[3]).toBe("https://specific.test/this-exact-fish")
    expect(result.changed).toBe(0)
  })

  test("but replaces a reason written for unknown, which no longer describes the status", () => {
    const result = applyAssessments([survey()], [catalogRow()])

    expect(result.rows[1]?.[3]).not.toMatch(/conservative unknown/)
  })

  test("the row order of food_allergens.csv", () => {
    const rows = [
      catalogRow({ foodCode: "z_food", allergenCode: "soy" }),
      catalogRow({ foodCode: "a_food", allergenCode: "peanut" })
    ]
    const result = applyAssessments(
      [
        survey({ foodCode: "z_food", allergenCode: "soy" }),
        survey({ foodCode: "a_food", allergenCode: "peanut" })
      ],
      rows
    )

    expect(result.rows.slice(1).map((row) => row[0])).toEqual(["z_food", "a_food"])
  })

  test("an untouched table round-trips without claiming a change", () => {
    const result = applyAssessments(
      [survey()],
      [
        catalogRow({
          status: "cross_contact_unverified",
          provenance: "Chicken is not the peanut category; handling is unverified."
        })
      ]
    )

    expect(result.changed).toBe(0)
    expect(result.refusals).toEqual([])
  })
})

describe("pair identity", () => {
  test("codes that concatenate to the same string are still different pairs", () => {
    const result = applyAssessments(
      [
        survey({ foodCode: "ab", allergenCode: "c" }),
        survey({ foodCode: "a", allergenCode: "bc" })
      ],
      [
        catalogRow({ foodCode: "ab", allergenCode: "c" }),
        catalogRow({ foodCode: "a", allergenCode: "bc" })
      ]
    )

    expect(result.refusals).toEqual([])
    expect(result.rows.slice(1)).toHaveLength(2)
  })
})
