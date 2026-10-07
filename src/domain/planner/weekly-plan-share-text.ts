const DAY_LABELS = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ Nhật"
] as const

function addDaysToIso(baseDate: string, days: number): { dayStr: string; dateLabel: string } {
  const parts = baseDate.split("-").map(Number)
  const year = parts[0] ?? 2026
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  const d = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0))
  const dayNum = String(d.getUTCDate()).padStart(2, "0")
  const monthNum = String(d.getUTCMonth() + 1).padStart(2, "0")
  const fullYear = d.getUTCFullYear()
  return {
    dayStr: `${fullYear}-${monthNum}-${dayNum}`,
    dateLabel: `${dayNum}/${monthNum}`
  }
}

export function formatWeekRangeLabel(weekStartIso: string): string {
  const start = addDaysToIso(weekStartIso, 0).dateLabel
  const end = addDaysToIso(weekStartIso, 6).dateLabel
  return `${start} – ${end}`
}

export interface WeeklyPlanShareDishItem {
  readonly dayIndex: number
  readonly mealName?: string | null
  readonly dishes: readonly string[]
}

export interface WeeklyPlanShareTextInput {
  readonly weekStart: string
  readonly items: readonly WeeklyPlanShareDishItem[]
  readonly householdName?: string | null
}

export function formatWeeklyPlanShareText({
  weekStart,
  items,
  householdName
}: WeeklyPlanShareTextInput): string {
  const range = formatWeekRangeLabel(weekStart)
  const title = householdName?.trim()
    ? `📋 Thực đơn Bếp Nhà — ${householdName.trim()} (Tuần ${range})`
    : `📋 Thực đơn Bếp Nhà (Tuần ${range})`

  const sortedItems = [...items].sort((a, b) => a.dayIndex - b.dayIndex)

  const lines = sortedItems.map((item) => {
    const dayLabel = DAY_LABELS[item.dayIndex] ?? `Ngày ${item.dayIndex + 1}`
    const { dateLabel } = addDaysToIso(weekStart, item.dayIndex)
    const dishesText =
      item.dishes.length > 0 ? item.dishes.join(" • ") : (item.mealName ?? "Nghỉ nấu / Tự túc")
    return `• ${dayLabel} (${dateLabel}): ${dishesText}`
  })

  return [title, "", ...lines, "", "👉 Kế hoạch dinh dưỡng gia đình từ Bếp Nhà"].join("\n")
}
