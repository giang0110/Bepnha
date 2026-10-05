export type FreshnessCategory =
  "leafy_vegetable" | "fresh_meat_seafood" | "root_vegetable_egg" | "dry_and_spices"

export interface FoodFreshnessInfo {
  readonly category: FreshnessCategory
  readonly labelVi: string
  readonly shelfLifeVi: string
  readonly urgencyPriority: number // 3 = high (urgent / use first), 2 = medium, 1 = low (shelf stable)
  readonly badgeColor: "chilli" | "clay" | "herb" | "broth"
  readonly hintVi: string
  readonly isUrgent: boolean
}

const FRESHNESS_METADATA: Readonly<Record<FreshnessCategory, FoodFreshnessInfo>> = Object.freeze({
  leafy_vegetable: {
    category: "leafy_vegetable",
    labelVi: "Rau lá & Tươi sống",
    shelfLifeVi: "1–3 ngày",
    urgencyPriority: 3,
    badgeColor: "herb",
    hintVi: "Dễ héo úa hoặc chua, ưu tiên chế biến trước trong 1–3 ngày",
    isUrgent: true
  },
  fresh_meat_seafood: {
    category: "fresh_meat_seafood",
    labelVi: "Thịt cá tươi",
    shelfLifeVi: "1–2 ngày mát",
    urgencyPriority: 3,
    badgeColor: "chilli",
    hintVi: "Nấu trong 24–48h nếu để ngăn mát, hoặc trữ đông ngay",
    isUrgent: true
  },
  root_vegetable_egg: {
    category: "root_vegetable_egg",
    labelVi: "Củ quả & Trứng",
    shelfLifeVi: "7–14 ngày",
    urgencyPriority: 2,
    badgeColor: "clay",
    hintVi: "Bảo quản nơi khô mát hoặc ngăn rau quả tủ lạnh",
    isUrgent: false
  },
  dry_and_spices: {
    category: "dry_and_spices",
    labelVi: "Lương thực & Gia vị",
    shelfLifeVi: "Dài hạn (vài tháng)",
    urgencyPriority: 1,
    badgeColor: "broth",
    hintVi: "Bảo quản khô ráo, đậy kín nắp sau khi dùng",
    isUrgent: false
  }
})

// Fresh meats, poultry, fish, seafood
const FRESH_PROTEIN_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bthit\b/u,
  /\bsuon\b/u,
  /\bba chi\b/u,
  /\bba roi\b/u,
  /\bnac\b/u,
  /\bbo\b/u,
  /\bheo\b/u,
  /\blon\b/u,
  /\bga\b/u,
  /\bvit\b/u,
  /\bchim\b/u,
  /\bca\b/u,
  /\btom\b/u,
  /\bmuc\b/u,
  /\bbach tuoc\b/u,
  /\bhai san\b/u,
  /\bcha ca\b/u,
  /\bgio song\b/u,
  /\bngheu\b/u,
  /\bngao\b/u,
  /\bso\b/u,
  /\boc\b/u,
  /\bluon\b/u,
  /\bech\b/u,
  /\bcua\b/u
])

// Highly perishable leafy greens, sprouts, soft tofu, fresh mushrooms
const LEAFY_VEG_PATTERNS: readonly RegExp[] = Object.freeze([
  /\brau\b/u,
  /\bcai\b/u,
  /\bmuong\b/u,
  /\bden\b/u,
  /\bngot\b/u,
  /\bxa lach\b/u,
  /\bhanh la\b/u,
  /\brau ngo\b/u,
  /\bngo ri\b/u,
  /\bmui\b/u,
  /\bgia do\b/u,
  /\bgia\b/u,
  /\bnam rom\b/u,
  /\bnam tuoi\b/u,
  /\bdau hu\b/u,
  /\btofu\b/u,
  /\bdua leo\b/u
])

// Durable root vegetables, squash, pumpkin, onions, garlic, eggs
// Checked before fresh protein so "cà rốt / cà chua" (ca) and "trứng gà / trứng vịt" (ga / vit) match here
const ROOT_VEG_EGG_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bca chua\b/u,
  /\bca rot\b/u,
  /\bca tim\b/u,
  /\bca phao\b/u,
  /\bbap cai\b/u,
  /\bdau cove\b/u,
  /\bdau co ve\b/u,
  /\bbi dao\b/u,
  /\bbi do\b/u,
  /\bbi\b/u,
  /\bmuop\b/u,
  /\bsu su\b/u,
  /\bkhoai tay\b/u,
  /\bkhoai lang\b/u,
  /\bkhoai\b/u,
  /\bhanh tay\b/u,
  /\bhanh tim\b/u,
  /\btoi\b/u,
  /\bgung\b/u,
  /\bsa\b/u,
  /\bot\b/u,
  /\btrung\b/u
])

function normalizeVietnamese(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/gu, "d")
    .toLowerCase()
}

export function classifyFoodFreshness(foodNameVi: string): FoodFreshnessInfo {
  const norm = normalizeVietnamese(foodNameVi)

  // Cabbage (bắp cải) is a sturdy head vegetable lasting 1-2 weeks, unlike fragile loose leafy greens
  if (/\bbap cai\b/u.test(norm)) {
    return FRESHNESS_METADATA.root_vegetable_egg
  }

  // 1. Check Leafy Greens / Sprouts / Tofu first (most fragile, 1-3 days)
  for (const pattern of LEAFY_VEG_PATTERNS) {
    if (pattern.test(norm)) {
      return FRESHNESS_METADATA.leafy_vegetable
    }
  }

  // 2. Check Root Vegetables / Hard Produce / Eggs (7-14 days)
  // Must precede protein to avoid "ca chua/ca rot" matching "ca" (fish) or "trung ga/vit" matching "ga/vit"
  for (const pattern of ROOT_VEG_EGG_PATTERNS) {
    if (pattern.test(norm)) {
      return FRESHNESS_METADATA.root_vegetable_egg
    }
  }

  // 3. Check Fresh Meats / Seafood (1-2 days chilled or frozen)
  for (const pattern of FRESH_PROTEIN_PATTERNS) {
    if (pattern.test(norm)) {
      return FRESHNESS_METADATA.fresh_meat_seafood
    }
  }

  // 4. Default to Dry goods & Spices (pantry staples)
  return FRESHNESS_METADATA.dry_and_spices
}

export function sortPantryByUrgency<T>(items: readonly T[], getFoodName: (item: T) => string): T[] {
  return [...items].sort((left, right) => {
    const leftFresh = classifyFoodFreshness(getFoodName(left))
    const rightFresh = classifyFoodFreshness(getFoodName(right))
    // Higher urgency priority comes first (3 before 2 before 1)
    const priorityDiff = rightFresh.urgencyPriority - leftFresh.urgencyPriority
    if (priorityDiff !== 0) return priorityDiff
    return getFoodName(left).localeCompare(getFoodName(right), "vi", { sensitivity: "base" })
  })
}
