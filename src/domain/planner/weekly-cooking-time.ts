/**
 * Pure domain logic for analyzing weekly cooking time distribution,
 * time categories (quick / standard / leisure), and schedule insights
 * for Vietnamese household meal planning.
 *
 * Deterministic and free from external dependencies or side effects.
 */

export type CookingEffortCategory = "quick" | "standard" | "leisure"

export const QUICK_MEAL_MAX_MINUTES = 30
export const STANDARD_MEAL_MAX_MINUTES = 45

const DAY_LABELS_VI = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ Nhật"
] as const

export interface DayCookingTimeInput {
  readonly dayIndex: number
  readonly mealOptionNameVi: string
  readonly elapsedMinutes: number
}

export interface DayCookingTime {
  readonly dayIndex: number
  readonly dayLabelVi: string
  readonly mealOptionNameVi: string
  readonly elapsedMinutes: number
  readonly category: CookingEffortCategory
  readonly categoryLabelVi: string
  readonly isWeekend: boolean
}

export interface WeeklyCookingTimeSummary {
  readonly totalMinutes: number
  readonly formattedTotalTimeVi: string
  readonly averageMinutes: number
  readonly quickMealCount: number
  readonly standardMealCount: number
  readonly leisureMealCount: number
  readonly weekdayAverageMinutes: number
  readonly weekendAverageMinutes: number
  readonly fastestMeal: DayCookingTime | null
  readonly longestMeal: DayCookingTime | null
  readonly days: readonly DayCookingTime[]
  readonly scheduleInsights: readonly string[]
}

/**
 * Classifies a meal's cooking duration into standard effort categories:
 * - Quick (Nấu nhanh): <= 30 minutes
 * - Standard (Tiêu chuẩn): 31 - 45 minutes
 * - Leisure (Nấu kỹ / Thong thả): > 45 minutes
 */
export function classifyCookingEffort(minutes: number): CookingEffortCategory {
  if (minutes <= QUICK_MEAL_MAX_MINUTES) {
    return "quick"
  }
  if (minutes <= STANDARD_MEAL_MAX_MINUTES) {
    return "standard"
  }
  return "leisure"
}

export function effortCategoryLabelVi(category: CookingEffortCategory): string {
  switch (category) {
    case "quick":
      return "Nấu nhanh (≤30p)"
    case "standard":
      return "Tiêu chuẩn (31-45p)"
    case "leisure":
      return "Nấu kỹ (>45p)"
  }
}

/**
 * Formats total minutes into friendly Vietnamese reading, e.g. "4 giờ 25 phút" or "35 phút".
 */
export function formatMinutesToHoursAndMinutesVi(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0 phút"
  }
  const rounded = Math.round(minutes)
  const hours = Math.floor(rounded / 60)
  const remainingMins = rounded % 60

  if (hours === 0) {
    return `${remainingMins} phút`
  }
  if (remainingMins === 0) {
    return `${hours} giờ`
  }
  return `${hours} giờ ${remainingMins} phút`
}

/**
 * Analyzes weekly meal plan items to produce schedule metrics, time breakdown,
 * and deterministic kitchen guidance.
 */
export function analyzeWeeklyCookingTime(
  items: readonly DayCookingTimeInput[]
): WeeklyCookingTimeSummary {
  if (items.length === 0) {
    return {
      totalMinutes: 0,
      formattedTotalTimeVi: "0 phút",
      averageMinutes: 0,
      quickMealCount: 0,
      standardMealCount: 0,
      leisureMealCount: 0,
      weekdayAverageMinutes: 0,
      weekendAverageMinutes: 0,
      fastestMeal: null,
      longestMeal: null,
      days: [],
      scheduleInsights: []
    }
  }

  const sortedItems = [...items].sort((a, b) => a.dayIndex - b.dayIndex)

  const days: DayCookingTime[] = sortedItems.map((item) => {
    const safeMinutes = Math.max(0, Math.round(item.elapsedMinutes))
    const category = classifyCookingEffort(safeMinutes)
    const dayLabelVi = DAY_LABELS_VI[item.dayIndex] ?? `Ngày ${item.dayIndex + 1}`
    const isWeekend = item.dayIndex >= 5

    return {
      dayIndex: item.dayIndex,
      dayLabelVi,
      mealOptionNameVi: item.mealOptionNameVi,
      elapsedMinutes: safeMinutes,
      category,
      categoryLabelVi: effortCategoryLabelVi(category),
      isWeekend
    }
  })

  const totalMinutes = days.reduce((sum, d) => sum + d.elapsedMinutes, 0)
  const averageMinutes = Math.round(totalMinutes / days.length)

  let quickMealCount = 0
  let standardMealCount = 0
  let leisureMealCount = 0

  for (const day of days) {
    if (day.category === "quick") quickMealCount++
    else if (day.category === "standard") standardMealCount++
    else leisureMealCount++
  }

  const weekdays = days.filter((d) => !d.isWeekend)
  const weekends = days.filter((d) => d.isWeekend)

  const weekdayTotal = weekdays.reduce((sum, d) => sum + d.elapsedMinutes, 0)
  const weekendTotal = weekends.reduce((sum, d) => sum + d.elapsedMinutes, 0)

  const weekdayAverageMinutes = weekdays.length > 0 ? Math.round(weekdayTotal / weekdays.length) : 0
  const weekendAverageMinutes = weekends.length > 0 ? Math.round(weekendTotal / weekends.length) : 0

  let fastestMeal: DayCookingTime | null = null
  let longestMeal: DayCookingTime | null = null

  for (const day of days) {
    if (fastestMeal === null || day.elapsedMinutes < fastestMeal.elapsedMinutes) {
      fastestMeal = day
    }
    if (longestMeal === null || day.elapsedMinutes > longestMeal.elapsedMinutes) {
      longestMeal = day
    }
  }

  // Generate deterministic schedule insights
  const scheduleInsights: string[] = []

  // Check for weekday heavy meals (> 45m)
  const heavyWeekdays = weekdays.filter((d) => d.category === "leisure")
  if (heavyWeekdays.length > 0) {
    const names = heavyWeekdays.map((d) => `${d.dayLabelVi} (${d.elapsedMinutes}p)`).join(", ")
    scheduleInsights.push(
      `Bữa nấu kỹ ngày thường: ${names}. Bạn nên tranh thủ sơ chế nguyên liệu từ sớm hoặc ướp sẵn.`
    )
  }

  // Check if weekend cooking time is longer than weekdays
  if (weekendAverageMinutes > weekdayAverageMinutes + 10 && weekends.length > 0) {
    scheduleInsights.push(
      `Cuối tuần dành trung bình ${weekendAverageMinutes} phút/bữa (so với ${weekdayAverageMinutes} phút ngày thường), rất hợp lý để cả nhà quây quần thưởng thức món hầm/kho kỹ.`
    )
  }

  // Quick meal count praise
  if (quickMealCount >= 3) {
    scheduleInsights.push(
      `Có ${quickMealCount}/${days.length} bữa nấu nhanh (≤30 phút), giúp người nội trợ thảnh thơi sau giờ làm.`
    )
  }

  return {
    totalMinutes,
    formattedTotalTimeVi: formatMinutesToHoursAndMinutesVi(totalMinutes),
    averageMinutes,
    quickMealCount,
    standardMealCount,
    leisureMealCount,
    weekdayAverageMinutes,
    weekendAverageMinutes,
    fastestMeal,
    longestMeal,
    days,
    scheduleInsights
  }
}
