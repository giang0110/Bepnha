/**
 * Names for the six nutrients the catalog is required to publish.
 *
 * The panel used to render `520 kcal · 30 g · 40 g · 12 g · 5 g · 800 mg` — six anonymous numbers
 * in a fixed order nobody has memorised. The names live in `public.nutrients.name_vi`, but the
 * planner response carries only the code, so they are mapped here rather than widened through four
 * layers for six strings that have not changed since the schema was written.
 *
 * A code with no name falls back to the code, as everywhere else on this page: an unlabelled number
 * is bad, an invented label is worse.
 */
const NUTRIENT_NAMES: Readonly<Record<string, string>> = Object.freeze({
  energy_kcal: "Năng lượng",
  protein_g: "Chất đạm",
  carbohydrate_g: "Tinh bột",
  fat_g: "Chất béo",
  fibre_g: "Chất xơ",
  sodium_mg: "Natri"
})

/** Energy first, then the macronutrients, then what is watched rather than counted. */
const NUTRIENT_ORDER: readonly string[] = Object.freeze([
  "energy_kcal",
  "protein_g",
  "carbohydrate_g",
  "fat_g",
  "fibre_g",
  "sodium_mg"
])

export function nutrientName(code: string): string {
  return NUTRIENT_NAMES[code] ?? code
}

export function orderedNutrients<T extends { readonly nutrientCode: string }>(
  nutrients: readonly T[]
): T[] {
  const rank = (code: string) => {
    const index = NUTRIENT_ORDER.indexOf(code)
    return index === -1 ? NUTRIENT_ORDER.length : index
  }
  return [...nutrients].sort((left, right) => rank(left.nutrientCode) - rank(right.nutrientCode))
}
