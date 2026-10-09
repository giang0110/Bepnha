export type StorageCategory =
  | "leafy_greens"
  | "seafood"
  | "braised_savory"
  | "soup_broth"
  | "cooked_rice_staple"
  | "tofu_egg"
  | "poultry_meat"
  | "general"

export type StorageSafetyTier = "do_not_keep_overnight" | "keep_max_24h" | "keep_2_to_3_days"

export interface FoodCategoryStorageRule {
  readonly storageCategory: StorageCategory
  readonly safetyTier: StorageSafetyTier
  readonly tierLabelVi: string
  readonly maxSafeStorageHours: number
  readonly maxSafeDaysLabelVi: string
  readonly containerRecommendation: string
  readonly reheatingInstruction: string
  readonly safetyNoticeVi: string
}

export interface DishLeftoverStorageItem {
  readonly dishName: string
  readonly mealRole?: string | undefined
  readonly rule: FoodCategoryStorageRule
}

export interface MealLeftoverStorageAnalysis {
  readonly rules: readonly DishLeftoverStorageItem[]
  readonly hasOvernightHazard: boolean
  readonly overnightHazardDishes: readonly string[]
  readonly summaryNoticeVi: string
}

const STORAGE_RULES: Readonly<Record<StorageCategory, FoodCategoryStorageRule>> = Object.freeze({
  leafy_greens: {
    storageCategory: "leafy_greens",
    safetyTier: "do_not_keep_overnight",
    tierLabelVi: "Không nên để qua đêm",
    maxSafeStorageHours: 6,
    maxSafeDaysLabelVi: "Nên dùng hết trong 4-6 giờ",
    containerRecommendation:
      "Ăn hết trong bữa. Nếu bắt buộc giữ, dùng hộp kín để ngăn mát và ăn trong ngày.",
    reheatingInstruction: "Hạn chế hâm lại nhiều lần vì làm nát rau và hao hụt vitamin.",
    safetyNoticeVi:
      "Rau lá xanh nấu chín để qua đêm vi khuẩn dễ chuyển hóa nitrat thành nitrit có hại cho sức khỏe. Nên ăn hết trong bữa."
  },
  seafood: {
    storageCategory: "seafood",
    safetyTier: "keep_max_24h",
    tierLabelVi: "Dùng trong 24 giờ",
    maxSafeStorageHours: 24,
    maxSafeDaysLabelVi: "Tối đa 1 ngày (ngăn mát <4°C)",
    containerRecommendation: "Hộp thủy tinh hoặc sứ có nắp đậy gioăng kín, tách biệt món khác.",
    reheatingInstruction: "Đun sôi hoặc áp chảo nóng đều trước khi dùng lại.",
    safetyNoticeVi:
      "Hải sản giàu đạm nhạy cảm, dễ phân hủy và biến tính protein nếu để lâu. Bảo quản tối đa 1 ngày và hâm kỹ."
  },
  braised_savory: {
    storageCategory: "braised_savory",
    safetyTier: "keep_2_to_3_days",
    tierLabelVi: "Bảo quản 2-3 ngày",
    maxSafeStorageHours: 72,
    maxSafeDaysLabelVi: "2 đến 3 ngày (ngăn mát <4°C)",
    containerRecommendation: "Hộp thủy tinh hoặc sứ kín nắp. Để nguội hoàn toàn trước khi cất.",
    reheatingInstruction:
      "Đun sôi lại sủi tăm đều trên bếp 2-3 phút hoặc quay lò vi sóng kèm nắp đậy.",
    safetyNoticeVi:
      "Món kho đậm đà, mặn ngọt có khả năng bảo quản tốt trong ngăn mát 2-3 ngày. Đun sôi lại kỹ trước mỗi lần dùng."
  },
  soup_broth: {
    storageCategory: "soup_broth",
    safetyTier: "keep_max_24h",
    tierLabelVi: "Dùng trong 24-48 giờ",
    maxSafeStorageHours: 48,
    maxSafeDaysLabelVi: "1 đến 2 ngày (ngăn mát <4°C)",
    containerRecommendation:
      "Múc canh ra tô sứ hoặc hộp thủy tinh đậy kín. Tránh để nguyên nồi kim loại qua đêm.",
    reheatingInstruction: "Đun sôi bùng lại ít nhất 2 phút trước khi thưởng thức.",
    safetyNoticeVi:
      "Để nguội hẳn trước khi cất tủ lạnh. Không để canh trong nồi kim loại qua đêm vì axit và muối có thể phản ứng với đáy nồi."
  },
  cooked_rice_staple: {
    storageCategory: "cooked_rice_staple",
    safetyTier: "keep_max_24h",
    tierLabelVi: "Dùng trong 24 giờ",
    maxSafeStorageHours: 24,
    maxSafeDaysLabelVi: "Tối đa 1 ngày (ngăn mát <4°C)",
    containerRecommendation: "Để cơm nguội bớt (dưới 1 tiếng) rồi cho ngay vào hộp kín bảo quản.",
    reheatingInstruction:
      "Hâm nóng bằng lò vi sóng kèm vài giọt nước hoặc làm món cơm chiên trứng thơm ngon.",
    safetyNoticeVi:
      "Không để cơm nguội ở nhiệt độ phòng quá lâu nhằm ngăn ngừa vi khuẩn Bacillus cereus phát triển. Cất tủ lạnh sớm khi nguội."
  },
  tofu_egg: {
    storageCategory: "tofu_egg",
    safetyTier: "keep_max_24h",
    tierLabelVi: "Dùng trong 24 giờ",
    maxSafeStorageHours: 24,
    maxSafeDaysLabelVi: "Tối đa 1 ngày (ngăn mát <4°C)",
    containerRecommendation: "Hộp kín có nắp đậy, bảo quản sâu trong ngăn mát.",
    reheatingInstruction: "Hâm nóng kỹ bằng chảo hoặc lò vi sóng.",
    safetyNoticeVi:
      "Đậu hũ và trứng sau khi chế biến dễ hút mùi và lên men trong thời tiết nồm ẩm. Dùng hết trong vòng 24 giờ."
  },
  poultry_meat: {
    storageCategory: "poultry_meat",
    safetyTier: "keep_2_to_3_days",
    tierLabelVi: "Bảo quản 2 ngày",
    maxSafeStorageHours: 48,
    maxSafeDaysLabelVi: "1 đến 2 ngày (ngăn mát <4°C)",
    containerRecommendation: "Hộp kín sạch sẽ, đậy nắp chống khô bề mặt thịt.",
    reheatingInstruction:
      "Đun nóng lại hoặc quay lò vi sóng đến khi thịt nóng đều từ trong ra ngoài.",
    safetyNoticeVi:
      "Thịt gia cầm luộc hoặc kho có thể giữ ngăn mát 1-2 ngày. Không để hở làm thịt bị khô cứng và nhiễm mùi tủ lạnh."
  },
  general: {
    storageCategory: "general",
    safetyTier: "keep_max_24h",
    tierLabelVi: "Dùng trong 24 giờ",
    maxSafeStorageHours: 24,
    maxSafeDaysLabelVi: "Tối đa 1-2 ngày (ngăn mát)",
    containerRecommendation: "Hộp kín nắp, bảo quản ngăn mát dưới 4°C.",
    reheatingInstruction: "Hâm nóng kỹ trước khi ăn.",
    safetyNoticeVi: "Để nguội hoàn toàn trước khi cất tủ lạnh và đậy kín để giữ vệ sinh."
  }
})

export function detectStorageCategory(dishName: string, role?: string): StorageCategory {
  const normalized = dishName.toLowerCase().trim()

  // 1. Leafy greens (rau muống, cải, ngót, mồng tơi, rau đay, xà lách, rau bí...)
  if (
    normalized.includes("rau muống") ||
    normalized.includes("rau ngót") ||
    normalized.includes("rau cải") ||
    normalized.includes("cải ngọt") ||
    normalized.includes("cải thìa") ||
    normalized.includes("cải bẹ") ||
    normalized.includes("cải thảo") ||
    normalized.includes("mồng tơi") ||
    normalized.includes("rau đay") ||
    normalized.includes("rau dền") ||
    normalized.includes("xà lách") ||
    normalized.includes("rau bí") ||
    normalized.includes("rau lang") ||
    normalized.includes("rau cúc") ||
    (normalized.includes("rau ") && normalized.includes("luộc"))
  ) {
    return "leafy_greens"
  }

  // 2. Braised savory dishes (kho, ram, rang, rim) take priority for meat/fish
  if (
    normalized.includes("kho tàu") ||
    normalized.includes("kho tiêu") ||
    normalized.includes("kho gừng") ||
    normalized.includes("kho tộ") ||
    normalized.includes("kho trứng") ||
    normalized.includes("ram mặn") ||
    normalized.includes("cháy cạnh") ||
    normalized.includes("rim mặn") ||
    normalized.includes("kho sả")
  ) {
    return "braised_savory"
  }

  // 3. Soups and broths
  if (
    role === "soup" ||
    normalized.startsWith("canh ") ||
    normalized.includes("nước dùng") ||
    normalized.includes("hầm củ") ||
    normalized.includes("hầm rau củ")
  ) {
    return "soup_broth"
  }

  // 4. Seafood (tôm, mực, cá, cua, ngao, nghêu, sò, ốc)
  if (
    normalized.includes("tôm") ||
    normalized.includes("mực") ||
    normalized.includes("cua") ||
    normalized.includes("ngao") ||
    normalized.includes("nghêu") ||
    normalized.includes("sò") ||
    normalized.includes("ốc") ||
    normalized.includes("cá ") ||
    normalized.includes("chả cá")
  ) {
    return "seafood"
  }

  // 5. Cooked rice & staples
  if (
    role === "staple" ||
    normalized.includes("cơm ") ||
    normalized.includes("xôi") ||
    normalized.includes("cháo")
  ) {
    return "cooked_rice_staple"
  }

  // 6. Tofu and eggs
  if (
    normalized.includes("đậu phụ") ||
    normalized.includes("đậu hũ") ||
    normalized.includes("trứng")
  ) {
    return "tofu_egg"
  }

  // 7. Poultry & braised meat
  if (
    normalized.includes("gà") ||
    normalized.includes("vịt") ||
    normalized.includes("ngan") ||
    normalized.includes("thịt ")
  ) {
    return "poultry_meat"
  }

  return "general"
}

export function classifyDishStorageRule(dishName: string, role?: string): FoodCategoryStorageRule {
  const category = detectStorageCategory(dishName, role)
  return STORAGE_RULES[category]
}

export function analyzeMealLeftoverStorage(
  dishes: readonly { readonly name: string; readonly role?: string | undefined }[]
): MealLeftoverStorageAnalysis {
  if (dishes.length === 0) {
    return {
      rules: [],
      hasOvernightHazard: false,
      overnightHazardDishes: [],
      summaryNoticeVi: "Chưa có thông tin món ăn để phân tích bảo quản."
    }
  }

  const items: DishLeftoverStorageItem[] = dishes.map((dish) => ({
    dishName: dish.name,
    mealRole: dish.role,
    rule: classifyDishStorageRule(dish.name, dish.role)
  }))

  const overnightHazardDishes = items
    .filter((item) => item.rule.safetyTier === "do_not_keep_overnight")
    .map((item) => item.dishName)

  const hasOvernightHazard = overnightHazardDishes.length > 0

  let summaryNoticeVi: string
  if (hasOvernightHazard) {
    const list = overnightHazardDishes.join(", ")
    summaryNoticeVi = `Lưu ý an toàn: Mâm cơm có món (${list}) không nên để qua đêm. Hãy ăn hết trong bữa; các món kho và thịt cá còn lại có thể đậy kín cất ngăn mát <4°C.`
  } else {
    summaryNoticeVi =
      "Tất cả các món đều có thể bảo quản an toàn trong ngăn mát 1-3 ngày. Nhớ để nguội hoàn toàn và đậy kín nắp hộp trước khi cất."
  }

  return {
    rules: items,
    hasOvernightHazard,
    overnightHazardDishes,
    summaryNoticeVi
  }
}
