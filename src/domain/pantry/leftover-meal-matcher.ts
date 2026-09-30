export type MatchStatus = "ready_to_cook" | "almost_ready" | "needs_ingredients"

export interface CanonicalDishRecipe {
  readonly id: string
  readonly dishNameVi: string
  readonly category: "poultry" | "pork" | "beef" | "fish" | "seafood" | "egg" | "tofu" | "vegetable"
  readonly primaryIngredients: readonly string[]
  readonly descriptionVi?: string
}

export interface LeftoverDishMatch {
  readonly dishId: string
  readonly dishNameVi: string
  readonly category: string
  readonly status: MatchStatus
  readonly matchedIngredients: readonly string[]
  readonly missingIngredients: readonly string[]
  readonly matchPercentage: number
}

export const CANONICAL_DISH_RECIPES: readonly CanonicalDishRecipe[] = Object.freeze([
  {
    id: "ga_kho_gung",
    dishNameVi: "Gà kho gừng",
    category: "poultry",
    primaryIngredients: ["Thịt gà ta", "Gừng"]
  },
  {
    id: "ga_chien_nuoc_mam",
    dishNameVi: "Gà chiên nước mắm",
    category: "poultry",
    primaryIngredients: ["Thịt gà ta", "Tỏi"]
  },
  {
    id: "ga_xao_sa_ot",
    dishNameVi: "Gà xào sả ớt",
    category: "poultry",
    primaryIngredients: ["Thịt gà ta", "Sả", "Ớt hiểm"]
  },
  {
    id: "ga_kho_nam",
    dishNameVi: "Gà kho nấm rơm",
    category: "poultry",
    primaryIngredients: ["Thịt gà ta", "Nấm rơm"]
  },
  {
    id: "thit_kho_trung",
    dishNameVi: "Thịt kho trứng",
    category: "pork",
    primaryIngredients: ["Thịt ba chỉ", "Trứng gà"]
  },
  {
    id: "suon_ram_man",
    dishNameVi: "Sườn ram mặn",
    category: "pork",
    primaryIngredients: ["Sườn heo", "Tỏi"]
  },
  {
    id: "thit_xao_dau_cove",
    dishNameVi: "Thịt xào đậu cô ve",
    category: "pork",
    primaryIngredients: ["Thịt nạc vai heo", "Đậu cô ve"]
  },
  {
    id: "thit_xao_hanh_tay",
    dishNameVi: "Thịt xào hành tây",
    category: "pork",
    primaryIngredients: ["Thịt nạc vai heo", "Hành tây"]
  },
  {
    id: "suon_kho_khoai_tay",
    dishNameVi: "Sườn kho khoai tây",
    category: "pork",
    primaryIngredients: ["Sườn heo", "Khoai tây"]
  },
  {
    id: "bo_xao_gia",
    dishNameVi: "Bò xào giá",
    category: "beef",
    primaryIngredients: ["Thịt bò bắp", "Giá đỗ"]
  },
  {
    id: "bo_kho_ca_rot",
    dishNameVi: "Bò kho cà rốt",
    category: "beef",
    primaryIngredients: ["Thịt bò bắp", "Cà rốt"]
  },
  {
    id: "bo_xao_hanh_tay",
    dishNameVi: "Bò xào hành tây",
    category: "beef",
    primaryIngredients: ["Thịt bò bắp", "Hành tây"]
  },
  {
    id: "ca_loc_kho_to",
    dishNameVi: "Cá lóc kho tộ",
    category: "fish",
    primaryIngredients: ["Cá lóc", "Hành tím"]
  },
  {
    id: "ca_basa_chien_gion",
    dishNameVi: "Cá basa chiên giòn",
    category: "fish",
    primaryIngredients: ["Cá basa", "Tỏi"]
  },
  {
    id: "ca_nuc_kho_ca_chua",
    dishNameVi: "Cá nục kho cà chua",
    category: "fish",
    primaryIngredients: ["Cá nục", "Cà chua"]
  },
  {
    id: "ca_basa_kho_tieu",
    dishNameVi: "Cá basa kho tiêu",
    category: "fish",
    primaryIngredients: ["Cá basa", "Tiêu xay"]
  },
  {
    id: "tom_rim_man",
    dishNameVi: "Tôm rim mặn",
    category: "seafood",
    primaryIngredients: ["Tôm thẻ", "Hành tím"]
  },
  {
    id: "tom_xao_bi_dao",
    dishNameVi: "Tôm xào bí đao",
    category: "seafood",
    primaryIngredients: ["Tôm thẻ", "Bí đao"]
  },
  {
    id: "muc_xao_ca_chua",
    dishNameVi: "Mực xào cà chua",
    category: "seafood",
    primaryIngredients: ["Mực ống", "Cà chua"]
  },
  {
    id: "trung_chien_hanh",
    dishNameVi: "Trứng chiên hành",
    category: "egg",
    primaryIngredients: ["Trứng gà", "Hành lá"]
  },
  {
    id: "trung_chien_thit_bam",
    dishNameVi: "Trứng chiên thịt băm",
    category: "egg",
    primaryIngredients: ["Trứng gà", "Thịt nạc vai heo"]
  },
  {
    id: "dau_hu_sot_ca_chua",
    dishNameVi: "Đậu hũ sốt cà chua",
    category: "tofu",
    primaryIngredients: ["Đậu hũ trắng", "Cà chua"]
  },
  {
    id: "dau_hu_chien_sa",
    dishNameVi: "Đậu hũ chiên sả",
    category: "tofu",
    primaryIngredients: ["Đậu hũ trắng", "Sả"]
  },
  {
    id: "dau_hu_kho_nam",
    dishNameVi: "Đậu hũ kho nấm",
    category: "tofu",
    primaryIngredients: ["Đậu hũ trắng", "Nấm rơm"]
  },
  {
    id: "rau_muong_xao_toi",
    dishNameVi: "Rau muống xào tỏi",
    category: "vegetable",
    primaryIngredients: ["Rau muống", "Tỏi"]
  },
  {
    id: "bap_cai_xao",
    dishNameVi: "Bắp cải xào",
    category: "vegetable",
    primaryIngredients: ["Bắp cải", "Tỏi"]
  },
  {
    id: "su_su_xao_ca_rot",
    dishNameVi: "Su su xào cà rốt",
    category: "vegetable",
    primaryIngredients: ["Su su", "Cà rốt"]
  },
  {
    id: "muop_xao_toi",
    dishNameVi: "Mướp xào tỏi",
    category: "vegetable",
    primaryIngredients: ["Mướp hương", "Tỏi"]
  },
  {
    id: "canh_bi_dao_thit_bam",
    dishNameVi: "Canh bí đao thịt băm",
    category: "vegetable",
    primaryIngredients: ["Bí đao", "Thịt nạc vai heo"]
  },
  {
    id: "canh_chua_ca_loc",
    dishNameVi: "Canh chua cá lóc",
    category: "fish",
    primaryIngredients: ["Cá lóc", "Cà chua"]
  },
  {
    id: "canh_cai_thao_thit",
    dishNameVi: "Canh cải thảo thịt bằm",
    category: "vegetable",
    primaryIngredients: ["Cải thảo", "Thịt nạc vai heo"]
  },
  {
    id: "canh_ca_chua_trung",
    dishNameVi: "Canh cà chua trứng",
    category: "egg",
    primaryIngredients: ["Cà chua", "Trứng gà"]
  },
  {
    id: "canh_bi_do_thit_bam",
    dishNameVi: "Canh bí đỏ thịt băm",
    category: "vegetable",
    primaryIngredients: ["Bí đỏ", "Thịt nạc vai heo"]
  }
])

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/gu, "d")
    .toLowerCase()
    .trim()
}

const COMMON_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "thit ba chi": ["thit ba chi", "thit ba roi", "ba chi", "ba roi"],
  "thit ba roi": ["thit ba chi", "thit ba roi", "ba chi", "ba roi"],
  "thit nac vai heo": [
    "thit nac vai heo",
    "thit nac",
    "thit heo",
    "thit nac vai",
    "thit lon",
    "thit bam",
    "thit xay"
  ],
  "thit bo bap": ["thit bo bap", "thit bo", "bo bap", "bap bo", "thit bo xay", "bo"],
  "dau hu trang": ["dau hu trang", "dau hu", "dau hu non", "tofu", "dau phu"],
  "trung ga": ["trung ga", "trung ga ta", "trung ga cong nghiep", "trung"],
  "bap cai": ["bap cai", "bap cai trang", "bap cai tim"],
  "ca loc": ["ca loc", "ca qua", "ca chuoi", "ca loc tuoi"],
  "thit ga ta": ["thit ga ta", "thit ga", "ga ta", "ga", "uc ga", "dui ga"],
  "suon heo": ["suon heo", "suon", "suon non", "suon lon"],
  "ca basa": ["ca basa", "basa", "ca tra"],
  "tom the": ["tom the", "tom", "tom su", "tom tuoi"],
  "muc ong": ["muc ong", "muc", "muc tuoi", "muc la"]
})

export function matchIngredients(
  requiredIngredient: string,
  availableIngredients: readonly string[]
): boolean {
  const reqNorm = normalizeText(requiredIngredient)
  const reqAliases = COMMON_ALIASES[reqNorm] ?? [reqNorm]

  for (const available of availableIngredients) {
    const availNorm = normalizeText(available)
    if (availNorm === reqNorm) return true

    // Check aliases
    for (const alias of reqAliases) {
      if (availNorm === alias || availNorm.includes(alias)) {
        return true
      }
    }

    // Direct inclusion check if substring is substantial (>= 4 characters)
    if (reqNorm.length >= 4 && (availNorm.includes(reqNorm) || reqNorm.includes(availNorm))) {
      return true
    }
  }

  return false
}

export function findLeftoverMealSuggestions(
  availableFoodNames: readonly string[],
  recipes: readonly CanonicalDishRecipe[] = CANONICAL_DISH_RECIPES
): readonly LeftoverDishMatch[] {
  if (availableFoodNames.length === 0) return []

  const results: LeftoverDishMatch[] = []

  for (const recipe of recipes) {
    const matched: string[] = []
    const missing: string[] = []

    for (const primary of recipe.primaryIngredients) {
      if (matchIngredients(primary, availableFoodNames)) {
        // Find the matched available name or preserve the canonical requirement name
        matched.push(primary)
      } else {
        missing.push(primary)
      }
    }

    if (matched.length === 0) continue

    let status: MatchStatus
    if (missing.length === 0) {
      status = "ready_to_cook"
    } else if (missing.length === 1) {
      status = "almost_ready"
    } else {
      status = "needs_ingredients"
    }

    const matchPercentage = Math.round((matched.length / recipe.primaryIngredients.length) * 100)

    results.push({
      dishId: recipe.id,
      dishNameVi: recipe.dishNameVi,
      category: recipe.category,
      status,
      matchedIngredients: matched,
      missingIngredients: missing,
      matchPercentage
    })
  }

  // Sort results: ready_to_cook first, then almost_ready, then needs_ingredients, by matchPercentage descending
  const statusRank: Record<MatchStatus, number> = {
    ready_to_cook: 1,
    almost_ready: 2,
    needs_ingredients: 3
  }

  return results.sort((a, b) => {
    const rankDiff = statusRank[a.status] - statusRank[b.status]
    if (rankDiff !== 0) return rankDiff
    return b.matchPercentage - a.matchPercentage
  })
}
