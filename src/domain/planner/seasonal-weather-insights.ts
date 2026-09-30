export type VietnameseSeason = "spring" | "summer" | "autumn" | "winter"
export type ThermalAffinity = "cooling" | "warming" | "neutral"
export type WeatherTendency = "hot" | "cold_rainy" | "pleasant"

export interface SeasonalMealItem {
  readonly dayIndex: number
  readonly mealOptionNameVi: string
}

export interface SeasonalBalanceReport {
  readonly season: VietnameseSeason
  readonly seasonLabel: string
  readonly seasonDescription: string
  readonly weatherTendency: WeatherTendency
  readonly coolingCount: number
  readonly warmingCount: number
  readonly neutralCount: number
  readonly coolingMeals: readonly { readonly dayIndex: number; readonly mealName: string }[]
  readonly warmingMeals: readonly { readonly dayIndex: number; readonly mealName: string }[]
  readonly advisoryVi: string
  readonly seasonalRecommendations: readonly string[]
  readonly suggestedDayToAdjust?: number
}

const SEASON_LABELS: Readonly<Record<VietnameseSeason, string>> = Object.freeze({
  spring: "Mùa Xuân",
  summer: "Mùa Hè (Nắng nóng)",
  autumn: "Mùa Thu (Mát dịu)",
  winter: "Mùa Đông (Se lạnh)"
})

const SEASON_DESCRIPTIONS: Readonly<Record<VietnameseSeason, string>> = Object.freeze({
  spring: "Tiết trời ấm áp, nồm ẩm, đón chào mùa mới cùng các món thanh nhẹ cân bằng.",
  summer:
    "Nắng nóng oi ả, cơ thể dễ mất nước — ưu tiên canh chua, món luộc và rau mát thanh nhiệt.",
  autumn:
    "Tiết trời heo may mát dịu, hanh hao — rất hợp với các món mặn đậm đà vừa phải, canh thanh ngọt.",
  winter:
    "Gió mùa se lạnh, mưa phùn — các món kho đậm vị gia vị ấm (gừng, sả, tiêu) giúp giữ ấm cơ thể."
})

export function seasonLabelVi(season: VietnameseSeason): string {
  return SEASON_LABELS[season]
}

export function seasonDescriptionVi(season: VietnameseSeason): string {
  return SEASON_DESCRIPTIONS[season]
}

/**
 * Detects the Vietnamese season from a solar date string (YYYY-MM-DD) or Date object.
 */
export function detectSeasonFromDate(solarDate: string | Date): VietnameseSeason {
  let month: number
  if (typeof solarDate === "string") {
    const parts = solarDate.split("-")
    month = Number(parts[1] ?? 1)
  } else {
    month = solarDate.getMonth() + 1
  }

  // Vietnam Solar Season division:
  // Tháng 2, 3, 4: Mùa Xuân
  // Tháng 5, 6, 7, 8: Mùa Hè / Hạ
  // Tháng 9, 10, 11: Mùa Thu
  // Tháng 12, 1: Mùa Đông
  if (month >= 2 && month <= 4) return "spring"
  if (month >= 5 && month <= 8) return "summer"
  if (month >= 9 && month <= 11) return "autumn"
  return "winter"
}

/**
 * Classifies dish thermal affinity (cooling vs warming vs neutral) based on traditional Vietnamese culinary principles.
 */
export function detectDishThermalAffinity(mealNameVi: string): ThermalAffinity {
  const norm = mealNameVi.toLowerCase()

  // 1. Cooling dishes: canh chua, canh thanh nhiệt, ngao, nghêu, hến, rau luộc, gỏi, nộm, mướp, bí đao...
  const coolingKeywords = [
    "canh chua",
    "canh ngao",
    "canh nghêu",
    "canh hến",
    "canh cua",
    "mồng tơi",
    "rau đay",
    "mướp",
    "bí đao",
    "bí xanh",
    "rau muống luộc",
    "rau dền luộc",
    "cải ngọt luộc",
    "thịt ba chỉ luộc",
    "thịt luộc",
    "gà hấp lá chanh",
    "canh bí đao",
    "lá giang",
    "gỏi",
    "nộm",
    "bún chả",
    "bún riêu",
    "chè"
  ]

  if (coolingKeywords.some((kw) => norm.includes(kw))) {
    return "cooling"
  }

  // 2. Warming dishes: kho gừng, kho tiêu, kho sả ớt, kho tộ, rang gừng, bò kho, bò sốt vang, canh dưa bò, lẩu gà, sườn ram...
  const warmingKeywords = [
    "kho gừng",
    "kho tiêu",
    "kho sả",
    "kho sa",
    "sả ớt",
    "sa ot",
    "rang gừng",
    "kho tộ",
    "bò kho",
    "bò sốt vang",
    "kho quẹt",
    "cháy cạnh",
    "ram mặn",
    "canh dưa bò",
    "lẩu gà lá é",
    "tiêu xay",
    "nướng mật ong",
    "chiên mắm"
  ]

  if (warmingKeywords.some((kw) => norm.includes(kw))) {
    return "warming"
  }

  return "neutral"
}

/**
 * Analyzes the weekly meal plan against seasonal/weather context.
 */
export function analyzeSeasonalBalance(
  items: readonly SeasonalMealItem[],
  weekStart: string,
  weatherOverride?: WeatherTendency
): SeasonalBalanceReport {
  const season = detectSeasonFromDate(weekStart)
  const defaultWeather: WeatherTendency =
    season === "summer" ? "hot" : season === "winter" ? "cold_rainy" : "pleasant"
  const weatherTendency = weatherOverride ?? defaultWeather

  let coolingCount = 0
  let warmingCount = 0
  let neutralCount = 0

  const coolingMeals: { dayIndex: number; mealName: string }[] = []
  const warmingMeals: { dayIndex: number; mealName: string }[] = []

  for (const item of items) {
    const affinity = detectDishThermalAffinity(item.mealOptionNameVi)
    if (affinity === "cooling") {
      coolingCount++
      coolingMeals.push({ dayIndex: item.dayIndex, mealName: item.mealOptionNameVi })
    } else if (affinity === "warming") {
      warmingCount++
      warmingMeals.push({ dayIndex: item.dayIndex, mealName: item.mealOptionNameVi })
    } else {
      neutralCount++
    }
  }

  let advisoryVi: string
  let suggestedDayToAdjust: number | undefined
  const seasonalRecommendations: string[] = []

  if (weatherTendency === "hot") {
    seasonalRecommendations.push(
      "Ưu tiên canh chua, canh ngao, rau muống luộc để giải nhiệt và bù nước."
    )
    seasonalRecommendations.push("Hạn chế các món quá nhiều dầu mỡ hoặc kho cay đậm liên tiếp.")

    if (coolingCount >= 3) {
      advisoryVi = `Tiết trời nắng nóng: Thực đơn tuần này có ${coolingCount} món thanh nhiệt, rất phù hợp và giúp cả nhà ăn ngon miệng, dễ tiêu.`
    } else if (warmingCount > 3) {
      suggestedDayToAdjust = warmingMeals[0]?.dayIndex
      advisoryVi = `Tiết trời nắng nóng: Tuần này có ${warmingCount} món ấm nồng, hơi đậm vị so với thời tiết. Bạn có thể bấm "Đổi bữa" sang canh chua hoặc món thanh nhiệt, thanh mát để đổi vị.`
    } else {
      advisoryVi = `Tiết trời nắng nóng: Nên bổ sung thêm món canh thanh mát hoặc rau củ luộc dầm sấu/chanh thanh nhiệt giải khát.`
    }
  } else if (weatherTendency === "cold_rainy") {
    seasonalRecommendations.push(
      "Ưu tiên món kho đậm vị (gừng, tiêu, sả ớt) và canh nóng hổi giữ ấm."
    )
    seasonalRecommendations.push(
      "Các món lẩu hoặc món hầm cuối tuần mang lại cảm giác ấm cúng cho cả nhà."
    )

    if (warmingCount >= 3) {
      advisoryVi = `Tiết trời se lạnh, mưa rét: Thực đơn có ${warmingCount} món ấm nồng, giàu gia vị gừng sả tiêu giúp giữ ấm cơ thể rất tốt.`
    } else if (coolingCount > 3) {
      suggestedDayToAdjust = coolingMeals[0]?.dayIndex
      advisoryVi = `Tiết trời se lạnh, mưa rét: Tuần này có nhiều món thanh mát. Bạn có thể bấm "Đổi bữa" sang các món ấm nồng như kho gừng, sả ớt hoặc canh dưa bò nóng hổi.`
    } else {
      advisoryVi = `Tiết trời se lạnh, mưa rét: Bữa cơm gia đình sẽ đậm đà hơn khi có thêm món kho tiêu hoặc canh hầm ấm nóng.`
    }
  } else {
    // Pleasant weather (Spring / Autumn)
    seasonalRecommendations.push(
      "Thời tiết mát dịu dễ chịu, thực đơn cân bằng hài hòa giữa món mặn, món xào và món canh."
    )
    advisoryVi = `Tiết trời mát dịu: Thực đơn cân bằng dinh dưỡng hài hòa (${coolingCount} món thanh mát, ${warmingCount} món ấm nồng).`
  }

  return {
    season,
    seasonLabel: seasonLabelVi(season),
    seasonDescription: seasonDescriptionVi(season),
    weatherTendency,
    coolingCount,
    warmingCount,
    neutralCount,
    coolingMeals,
    warmingMeals,
    advisoryVi,
    seasonalRecommendations,
    ...(suggestedDayToAdjust === undefined ? {} : { suggestedDayToAdjust })
  }
}
