import type { HouseholdRuleKind } from "@/domain/household/household"

export const HOUSEHOLD_RULE_OPTIONS = [
  {
    code: "allergen_peanut",
    targetKey: "peanut",
    ruleKind: "allergen_exclusion",
    labelVi: "Dị ứng đậu phộng",
    sortOrder: 1
  },
  {
    code: "allergen_tree_nut",
    targetKey: "tree_nut",
    ruleKind: "allergen_exclusion",
    labelVi: "Dị ứng các loại hạt cây",
    sortOrder: 2
  },
  {
    code: "allergen_milk",
    targetKey: "dairy",
    ruleKind: "allergen_exclusion",
    labelVi: "Dị ứng sữa",
    sortOrder: 3
  },
  {
    code: "allergen_egg",
    targetKey: "egg",
    ruleKind: "allergen_exclusion",
    labelVi: "Dị ứng trứng",
    sortOrder: 4
  },
  {
    code: "allergen_soy",
    targetKey: "soy",
    ruleKind: "allergen_exclusion",
    labelVi: "Dị ứng đậu nành",
    sortOrder: 5
  },
  {
    code: "allergen_wheat",
    targetKey: "wheat",
    ruleKind: "allergen_exclusion",
    labelVi: "Dị ứng lúa mì",
    sortOrder: 6
  },
  {
    code: "allergen_fish",
    targetKey: "fish",
    ruleKind: "allergen_exclusion",
    labelVi: "Dị ứng cá",
    sortOrder: 7
  },
  {
    code: "allergen_crustacean",
    targetKey: "crustacean",
    ruleKind: "allergen_exclusion",
    labelVi: "Dị ứng giáp xác (tôm, cua)",
    sortOrder: 8
  },
  {
    code: "allergen_mollusc",
    targetKey: "mollusc",
    ruleKind: "allergen_exclusion",
    labelVi: "Dị ứng nhuyễn thể",
    sortOrder: 9
  },
  {
    code: "allergen_sesame",
    targetKey: "sesame",
    ruleKind: "allergen_exclusion",
    labelVi: "Dị ứng mè (vừng)",
    sortOrder: 10
  },
  {
    code: "allergen_other",
    targetKey: "unsupported_allergen",
    ruleKind: "allergen_exclusion",
    labelVi: "Dị ứng khác chưa có trong danh sách",
    sortOrder: 11
  },
  {
    code: "exclude_pork",
    targetKey: "pork",
    ruleKind: "food_exclusion",
    labelVi: "Không dùng thịt heo",
    sortOrder: 12
  },
  {
    code: "exclude_beef",
    targetKey: "beef",
    ruleKind: "food_exclusion",
    labelVi: "Không dùng thịt bò",
    sortOrder: 13
  },
  {
    code: "exclude_poultry",
    targetKey: "poultry",
    ruleKind: "food_exclusion",
    labelVi: "Không dùng thịt gia cầm",
    sortOrder: 14
  },
  {
    code: "exclude_seafood",
    targetKey: "seafood",
    ruleKind: "food_exclusion",
    labelVi: "Không dùng hải sản",
    sortOrder: 15
  },
  {
    code: "exclude_egg",
    targetKey: "egg",
    ruleKind: "food_exclusion",
    labelVi: "Không dùng trứng",
    sortOrder: 16
  },
  {
    code: "exclude_dairy",
    targetKey: "dairy",
    ruleKind: "food_exclusion",
    labelVi: "Không dùng sữa",
    sortOrder: 17
  },
  {
    code: "diet_vegetarian",
    targetKey: "vegetarian",
    ruleKind: "food_exclusion",
    labelVi: "Ăn chay",
    sortOrder: 18
  },
  {
    code: "prefer_pork",
    targetKey: "pork",
    ruleKind: "soft_preference",
    labelVi: "Ưu tiên thịt heo",
    sortOrder: 19
  },
  {
    code: "prefer_beef",
    targetKey: "beef",
    ruleKind: "soft_preference",
    labelVi: "Ưu tiên thịt bò",
    sortOrder: 20
  },
  {
    code: "prefer_poultry",
    targetKey: "poultry",
    ruleKind: "soft_preference",
    labelVi: "Ưu tiên thịt gia cầm",
    sortOrder: 21
  },
  {
    code: "prefer_fish",
    targetKey: "fish",
    ruleKind: "soft_preference",
    labelVi: "Ưu tiên cá",
    sortOrder: 22
  },
  {
    code: "prefer_seafood",
    targetKey: "seafood",
    ruleKind: "soft_preference",
    labelVi: "Ưu tiên hải sản",
    sortOrder: 23
  },
  {
    code: "prefer_tofu",
    targetKey: "tofu",
    ruleKind: "soft_preference",
    labelVi: "Ưu tiên đậu hũ",
    sortOrder: 24
  },
  {
    code: "prefer_vegetable_forward",
    targetKey: "vegetable_forward",
    ruleKind: "soft_preference",
    labelVi: "Ưu tiên nhiều rau",
    sortOrder: 25
  },
  {
    code: "prefer_soup",
    targetKey: "soup",
    ruleKind: "soft_preference",
    labelVi: "Ưu tiên món canh",
    sortOrder: 26
  }
] as const satisfies readonly {
  code: string
  targetKey: string
  ruleKind: HouseholdRuleKind
  labelVi: string
  sortOrder: number
}[]

export type HouseholdRuleOption = (typeof HOUSEHOLD_RULE_OPTIONS)[number]
export type HouseholdRuleCode = HouseholdRuleOption["code"]

export const HOUSEHOLD_RULE_OPTION_BY_CODE = new Map<HouseholdRuleCode, HouseholdRuleOption>(
  HOUSEHOLD_RULE_OPTIONS.map((option) => [option.code, option])
)
