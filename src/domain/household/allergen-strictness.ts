/**
 * How far a household wants an allergy rule to reach.
 *
 * The catalog can tell two different things apart: an allergen that is not an ingredient of a food
 * at all, and one that is additionally cleared through the supplier's handling. For a generic
 * market ingredient — pork belly from a wet market, rice from a sack — the second is not knowable,
 * so `cross_contact_unverified` is the honest status and it covers most of the catalog.
 *
 * Whether that status is acceptable is a medical question, not a catalog question, and the answer
 * differs per household and per allergen: a child with anaphylaxis and an adult with a mild
 * intolerance cannot share one policy. So the household answers it, once per allergy it declares.
 *
 * Unset always means {@link DEFAULT_ALLERGEN_STRICTNESS}. Missing data must never read as the more
 * permissive choice.
 */
export type AllergenStrictness = "strict" | "ingredient_only"

export const ALLERGEN_STRICTNESS_VALUES = ["strict", "ingredient_only"] as const

export const DEFAULT_ALLERGEN_STRICTNESS: AllergenStrictness = "strict"

export const ALLERGEN_STRICTNESS_LABELS_VI: Readonly<Record<AllergenStrictness, string>> = {
  strict: "Nghiêm ngặt — loại cả món chưa kiểm chứng được khâu chế biến",
  ingredient_only: "Theo nguyên liệu — chỉ loại món có dùng nguyên liệu đó"
}

export function isAllergenStrictness(value: unknown): value is AllergenStrictness {
  return (
    typeof value === "string" && (ALLERGEN_STRICTNESS_VALUES as readonly string[]).includes(value)
  )
}

/**
 * Resolves the strictness for one rule, defaulting to `strict`.
 *
 * Every caller reads a household's choice through this function so that an absent map, an absent
 * key, or a value that did not survive a round trip all land on the safe answer rather than on
 * whatever the caller happened to write at the call site.
 *
 * The lookup is deliberately own-property only. A plain object inherits from `Object.prototype`, so
 * a `ruleCode` reaching the prototype chain — whether through pollution or through a key like
 * `constructor` — would otherwise be able to answer this question for every household at once, in
 * the permissive direction.
 */
export function resolveAllergenStrictness(
  strictnessByRuleCode: Readonly<Record<string, AllergenStrictness>> | undefined,
  ruleCode: string
): AllergenStrictness {
  if (strictnessByRuleCode === undefined || !Object.hasOwn(strictnessByRuleCode, ruleCode)) {
    return DEFAULT_ALLERGEN_STRICTNESS
  }
  const declared = strictnessByRuleCode[ruleCode]
  return isAllergenStrictness(declared) ? declared : DEFAULT_ALLERGEN_STRICTNESS
}
