import { describe, expect, test } from "vitest"

import {
  ALLERGEN_STRICTNESS_VALUES,
  DEFAULT_ALLERGEN_STRICTNESS,
  isAllergenStrictness,
  resolveAllergenStrictness
} from "@/domain/household/allergen-strictness"

describe("allergen strictness", () => {
  test("defaults to the reading that excludes more", () => {
    expect(DEFAULT_ALLERGEN_STRICTNESS).toBe("strict")
  })

  test("recognises exactly the two declared values", () => {
    expect([...ALLERGEN_STRICTNESS_VALUES]).toEqual(["strict", "ingredient_only"])
    expect(ALLERGEN_STRICTNESS_VALUES.every(isAllergenStrictness)).toBe(true)
  })

  test.each([undefined, null, "", "STRICT", "Strict", "lenient", "absent", 0, 1, true, {}, []])(
    "rejects %o as a strictness",
    (value) => {
      expect(isAllergenStrictness(value)).toBe(false)
    }
  )

  test("resolves a declared value", () => {
    expect(resolveAllergenStrictness({ allergen_soy: "ingredient_only" }, "allergen_soy")).toBe(
      "ingredient_only"
    )
  })

  test.each([
    ["an absent map", undefined],
    ["an empty map", {}],
    ["a map for another rule", { allergen_peanut: "ingredient_only" }],
    ["a value outside the union", { allergen_soy: "lenient" }],
    ["a value of the wrong type", { allergen_soy: 1 }],
    ["a prototype key", { allergen_soy: undefined }]
  ])("falls back to strict for %s", (_label, map) => {
    expect(resolveAllergenStrictness(map as never, "allergen_soy")).toBe("strict")
  })

  test("an inherited property never reads as permission", () => {
    const inherited = Object.create({ allergen_soy: "ingredient_only" }) as Record<string, never>

    expect(resolveAllergenStrictness(inherited, "allergen_soy")).toBe("strict")
  })

  test("a key that resolves on Object.prototype never reads as permission", () => {
    expect(resolveAllergenStrictness({}, "constructor")).toBe("strict")
    expect(resolveAllergenStrictness({}, "toString")).toBe("strict")
  })
})
