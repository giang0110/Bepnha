export type HardRuleCode =
  | "allergen_peanut"
  | "allergen_tree_nut"
  | "allergen_milk"
  | "allergen_egg"
  | "allergen_soy"
  | "allergen_wheat"
  | "allergen_fish"
  | "allergen_crustacean"
  | "allergen_mollusc"
  | "allergen_sesame"
  | "allergen_other"
  | "exclude_pork"
  | "exclude_beef"
  | "exclude_poultry"
  | "exclude_seafood"
  | "exclude_egg"
  | "exclude_dairy"
  | "diet_vegetarian"

export type HardRuleCatalogTarget =
  | { readonly kind: "allergen"; readonly targetCode: string }
  | { readonly kind: "category"; readonly targetCode: string }
  | { readonly kind: "required_tag"; readonly targetCode: string }
  | { readonly kind: "unsupported" }

export const HARD_RULE_MAPPINGS = {
  allergen_peanut: { kind: "allergen", targetCode: "peanut" },
  allergen_tree_nut: { kind: "allergen", targetCode: "tree_nut" },
  allergen_milk: { kind: "allergen", targetCode: "dairy" },
  allergen_egg: { kind: "allergen", targetCode: "egg" },
  allergen_soy: { kind: "allergen", targetCode: "soy" },
  allergen_wheat: { kind: "allergen", targetCode: "wheat" },
  allergen_fish: { kind: "allergen", targetCode: "fish" },
  allergen_crustacean: { kind: "allergen", targetCode: "crustacean" },
  allergen_mollusc: { kind: "allergen", targetCode: "mollusc" },
  allergen_sesame: { kind: "allergen", targetCode: "sesame" },
  allergen_other: { kind: "unsupported" },
  exclude_pork: { kind: "category", targetCode: "pork" },
  exclude_beef: { kind: "category", targetCode: "beef" },
  exclude_poultry: { kind: "category", targetCode: "poultry" },
  exclude_seafood: { kind: "category", targetCode: "seafood" },
  exclude_egg: { kind: "category", targetCode: "egg" },
  exclude_dairy: { kind: "category", targetCode: "dairy" },
  diet_vegetarian: { kind: "required_tag", targetCode: "vegetarian" }
} as const satisfies Readonly<Record<HardRuleCode, HardRuleCatalogTarget>>

export type HardRuleMappingCoverageResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly code: "INCOMPLETE_HARD_RULE_MAPPING" } }

export function validateHardRuleMappingCoverage(
  options: readonly {
    readonly code: string
    readonly ruleKind: string
    readonly [key: string]: unknown
  }[]
): HardRuleMappingCoverageResult {
  const hardCodes = options
    .filter((option) => option.ruleKind !== "soft_preference")
    .map((option) => option.code)
    .sort()
  const mappedCodes = Object.keys(HARD_RULE_MAPPINGS).sort()
  const softCodeMapped = options.some(
    (option) => option.ruleKind === "soft_preference" && option.code in HARD_RULE_MAPPINGS
  )

  if (softCodeMapped || hardCodes.join("|") !== mappedCodes.join("|")) {
    return { ok: false, error: { code: "INCOMPLETE_HARD_RULE_MAPPING" } }
  }

  return { ok: true }
}

export function isHardRuleCode(code: string): code is HardRuleCode {
  return code in HARD_RULE_MAPPINGS
}
