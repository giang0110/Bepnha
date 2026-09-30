import { solarToVietnameseLunar, type VietnameseLunarDate } from "./vietnamese-lunar-calendar.js"

export type ProteinGroup =
  "pork" | "beef" | "poultry" | "seafood" | "egg_tofu" | "vegetarian" | "other"

const PROTEIN_LABELS: Readonly<Record<ProteinGroup, string>> = {
  pork: "Thịt heo",
  beef: "Thịt bò",
  poultry: "Thịt gà/vịt",
  seafood: "Cá & Hải sản",
  egg_tofu: "Trứng & Đậu phụ",
  vegetarian: "Món chay",
  other: "Món khác"
}

export function proteinGroupLabel(group: ProteinGroup): string {
  return PROTEIN_LABELS[group]
}

const DAY_NAMES = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

export interface MealRotationItem {
  readonly dayIndex: number
  readonly mealOptionNameVi: string
  readonly elapsedMinutes?: number
}

export interface ConsecutiveRepeatAdvisory {
  readonly dayIndex1: number
  readonly dayIndex2: number
  readonly dayName1: string
  readonly dayName2: string
  readonly proteinGroup: ProteinGroup
  readonly message: string
}

export interface LunarVegetarianDayInfo {
  readonly dayIndex: number
  readonly solarDate: string
  readonly lunarDate: VietnameseLunarDate
  readonly isMealVegetarian: boolean
  readonly advisory: string
}

export interface WeekendMealInfo {
  readonly dayIndex: number
  readonly dayName: string
  readonly mealName: string
  readonly isCelebratory: boolean
}

export interface WeeklyRotationReport {
  readonly proteinCounts: Readonly<Record<ProteinGroup, number>>
  readonly dominantProtein: ProteinGroup | null
  readonly consecutiveRepeats: readonly ConsecutiveRepeatAdvisory[]
  readonly lunarVegetarianDays: readonly LunarVegetarianDayInfo[]
  readonly weekendMeals: readonly WeekendMealInfo[]
}

/**
 * Detects the dominant protein group from a Vietnamese meal title.
 */
export function detectProteinGroup(mealNameVi: string): ProteinGroup {
  const normalized = mealNameVi.toLowerCase()

  // 1. Explicit vegetarian check
  if (
    normalized.includes("chay") ||
    normalized.includes("nấm đùi gà kho tiêu") ||
    normalized.includes("nấm rơm kho") ||
    normalized.includes("rau củ kho chay")
  ) {
    return "vegetarian"
  }

  // 2. Seafood check (cá, tôm, mực, cua, ngao, nghêu, hến, ốc, lươn)
  if (
    normalized.includes("cá ") ||
    normalized.includes("cá_") ||
    normalized.includes("tôm") ||
    normalized.includes("mực") ||
    normalized.includes("cua") ||
    normalized.includes("ngao") ||
    normalized.includes("nghêu") ||
    normalized.includes("hến") ||
    normalized.includes("ốc") ||
    normalized.includes("lươn") ||
    normalized.includes("chả cá")
  ) {
    return "seafood"
  }

  // 3. Beef check (bò, bắp bò, gầu bò)
  if (
    normalized.includes("bò") ||
    normalized.includes("bắp bò") ||
    normalized.includes("gầu bò") ||
    normalized.includes("bò kho")
  ) {
    return "beef"
  }

  // 4. Poultry check (gà, vịt, chim, ngan)
  if (
    normalized.includes("gà") ||
    normalized.includes("vịt") ||
    normalized.includes("chim") ||
    normalized.includes("ngan")
  ) {
    return "poultry"
  }

  // 5. Egg and Tofu check (đậu phụ, đậu hũ, trứng)
  if (
    normalized.includes("đậu phụ") ||
    normalized.includes("đậu hũ") ||
    normalized.includes("chao") ||
    normalized.startsWith("trứng") ||
    normalized.includes(" trứng")
  ) {
    return "egg_tofu"
  }

  // 6. Pork check (heo, lợn, sườn, ba chỉ, thịt băm, xá xíu, chả lụa, giò)
  if (
    normalized.includes("heo") ||
    normalized.includes("lợn") ||
    normalized.includes("sườn") ||
    normalized.includes("ba chỉ") ||
    normalized.includes("thịt băm") ||
    normalized.includes("xá xíu") ||
    normalized.includes("chả lụa") ||
    normalized.includes("thịt kho") ||
    normalized.includes("thịt rang") ||
    normalized.includes("nem rán") ||
    normalized.includes("thịt nướng") ||
    normalized.includes("bún chả") ||
    normalized.includes("thịt ") ||
    normalized.startsWith("thịt ")
  ) {
    return "pork"
  }

  return "other"
}

/**
 * Checks if a dish is traditionally celebrated or gathering-style on weekends in Vietnamese cuisine
 * (e.g. bún chả, lẩu, cuốn, bánh xèo, phở, nem rán, bò kho...).
 */
export function isWeekendDish(mealNameVi: string, elapsedMinutes = 0): boolean {
  const normalized = mealNameVi.toLowerCase()
  const gatheringKeywords = [
    "bún",
    "phở",
    "miến",
    "lẩu",
    "cuốn",
    "bánh xèo",
    "nem rán",
    "chả giò",
    "bò kho",
    "gà nướng",
    "gà hấp",
    "vịt nướng",
    "sườn nướng",
    "vịt quay"
  ]

  const matchesKeyword = gatheringKeywords.some((kw) => normalized.includes(kw))
  return matchesKeyword || elapsedMinutes >= 45
}

function addDaysToIso(baseDate: string, days: number): string {
  const parts = baseDate.split("-").map(Number)
  const year = parts[0] ?? 2026
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  const d = new Date(year, month - 1, day + days, 12, 0, 0)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dt = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dt}`
}

/**
 * Analyzes a weekly plan for protein balance, consecutive repeats, Vietnamese lunar calendar events,
 * and weekend meal variety.
 */
export function analyzeWeeklyRotation(
  items: readonly MealRotationItem[],
  weekStart: string
): WeeklyRotationReport {
  const sorted = [...items].sort((a, b) => a.dayIndex - b.dayIndex)

  const proteinCounts: Record<ProteinGroup, number> = {
    pork: 0,
    beef: 0,
    poultry: 0,
    seafood: 0,
    egg_tofu: 0,
    vegetarian: 0,
    other: 0
  }

  const consecutiveRepeats: ConsecutiveRepeatAdvisory[] = []
  const weekendMeals: WeekendMealInfo[] = []
  const lunarVegetarianDays: LunarVegetarianDayInfo[] = []

  let prevGroup: ProteinGroup | null = null
  let prevDayIndex = -1

  for (const item of sorted) {
    const group = detectProteinGroup(item.mealOptionNameVi)
    proteinCounts[group] += 1

    // Check consecutive repeat (only for substantive meat/protein groups)
    if (
      prevGroup !== null &&
      prevGroup === group &&
      item.dayIndex === prevDayIndex + 1 &&
      group !== "vegetarian" &&
      group !== "other"
    ) {
      const dayName1 = DAY_NAMES[prevDayIndex] ?? `Bữa ${prevDayIndex + 1}`
      const dayName2 = DAY_NAMES[item.dayIndex] ?? `Bữa ${item.dayIndex + 1}`
      const groupName = proteinGroupLabel(group)

      consecutiveRepeats.push({
        dayIndex1: prevDayIndex,
        dayIndex2: item.dayIndex,
        dayName1,
        dayName2,
        proteinGroup: group,
        message: `${dayName1} và ${dayName2} đều dùng ${groupName} — bạn có thể bấm "Đổi bữa" để xoay vòng sang nguồn đạm khác giúp đổi vị cho cả nhà.`
      })
    }

    prevGroup = group
    prevDayIndex = item.dayIndex

    // Check weekend meals (Saturday = 5, Sunday = 6)
    if (item.dayIndex === 5 || item.dayIndex === 6) {
      const isCelebratory = isWeekendDish(item.mealOptionNameVi, item.elapsedMinutes)
      weekendMeals.push({
        dayIndex: item.dayIndex,
        dayName: DAY_NAMES[item.dayIndex] ?? "Cuối tuần",
        mealName: item.mealOptionNameVi,
        isCelebratory
      })
    }

    // Check Vietnamese lunar calendar
    const solarDate = addDaysToIso(weekStart, item.dayIndex)
    const lunar = solarToVietnameseLunar(solarDate)
    if (lunar.isVegetarianDay) {
      const isMealVeg = group === "vegetarian"
      const specialTitle = lunar.specialDayLabel ?? `Ngày ${lunar.day}/${lunar.month} Âm lịch`
      lunarVegetarianDays.push({
        dayIndex: item.dayIndex,
        solarDate,
        lunarDate: lunar,
        isMealVegetarian: isMealVeg,
        advisory: isMealVeg
          ? `${specialTitle}: Bữa ăn đã là món Chay thanh tịnh, rất phù hợp với phong tục gia đình.`
          : `${specialTitle}: Nếu gia đình có phong tục ăn chay, bạn có thể bấm "Đổi bữa" để chuyển sang món Chay thanh tịnh.`
      })
    }
  }

  // Calculate dominant protein
  let dominantProtein: ProteinGroup | null = null
  let maxCount = 0
  for (const [key, count] of Object.entries(proteinCounts)) {
    if (key !== "other" && count > maxCount) {
      maxCount = count
      dominantProtein = key as ProteinGroup
    }
  }

  return {
    proteinCounts,
    dominantProtein,
    consecutiveRepeats,
    lunarVegetarianDays,
    weekendMeals
  }
}
