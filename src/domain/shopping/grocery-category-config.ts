export const GROCERY_CATEGORY_CONFIG_VERSION = "grocery-category-v1" as const

export type GroceryCategoryCode =
  | "fresh_produce"
  | "meat_seafood"
  | "eggs_tofu_dairy"
  | "staples"
  | "seasonings"
  | "other"

export interface GroceryCategoryDefinition {
  readonly code: GroceryCategoryCode
  readonly labelVi: string
  readonly order: number
}

export const GROCERY_CATEGORIES: readonly GroceryCategoryDefinition[] = Object.freeze([
  { code: "fresh_produce", labelVi: "Rau củ", order: 10 },
  { code: "meat_seafood", labelVi: "Thịt, cá & hải sản", order: 20 },
  { code: "eggs_tofu_dairy", labelVi: "Trứng, đậu hũ & sữa", order: 30 },
  { code: "staples", labelVi: "Lương thực chính", order: 40 },
  { code: "seasonings", labelVi: "Gia vị", order: 50 },
  { code: "other", labelVi: "Khác", order: 60 }
])

const CATEGORY_BY_FACT_CODE: Readonly<Record<string, GroceryCategoryCode>> = Object.freeze({
  vegetable: "fresh_produce",
  pork: "meat_seafood",
  beef: "meat_seafood",
  poultry: "meat_seafood",
  seafood: "meat_seafood",
  fish: "meat_seafood",
  crustacean: "meat_seafood",
  mollusc: "meat_seafood",
  egg: "eggs_tofu_dairy",
  tofu: "eggs_tofu_dairy",
  dairy: "eggs_tofu_dairy",
  staple: "staples",
  seasoning: "seasonings"
})

export function groceryCategoryDefinition(code: GroceryCategoryCode): GroceryCategoryDefinition {
  return GROCERY_CATEGORIES.find((item) => item.code === code) ?? GROCERY_CATEGORIES.at(-1)!
}

export function resolveGroceryCategory(
  categoryAncestry: readonly string[]
): GroceryCategoryCode | null {
  const mapped = new Set(
    categoryAncestry
      .map((code) => CATEGORY_BY_FACT_CODE[code])
      .filter((code): code is GroceryCategoryCode => code !== undefined && code !== "other")
  )
  if (mapped.size === 1) return [...mapped][0]!
  if (mapped.size > 1) return "other"
  return null
}
