export interface EatOutDayConfig {
  readonly dayIndex: number
  readonly isEatOut: boolean
  readonly reasonNote?: string | undefined
}

export interface WeeklyScheduleSummary {
  readonly totalDays: number
  readonly homeCookingDaysCount: number
  readonly eatOutDaysCount: number
  readonly totalCookingMinutes: number
  readonly averageCookingMinutesPerCookingDay: number
}

export function summarizeWeeklySchedule(
  totalPlannedDays: number,
  planItems: readonly { readonly dayIndex: number; readonly elapsedMinutes: number }[],
  eatOutDays: readonly number[]
): WeeklyScheduleSummary {
  const eatOutSet = new Set(eatOutDays)
  const cookingItems = planItems.filter((item) => !eatOutSet.has(item.dayIndex))
  const totalCookingMinutes = cookingItems.reduce((acc, item) => acc + item.elapsedMinutes, 0)
  const homeCookingDaysCount = Math.max(0, totalPlannedDays - eatOutSet.size)
  const averageCookingMinutesPerCookingDay =
    homeCookingDaysCount > 0 ? Math.round(totalCookingMinutes / homeCookingDaysCount) : 0

  return {
    totalDays: totalPlannedDays,
    homeCookingDaysCount,
    eatOutDaysCount: eatOutSet.size,
    totalCookingMinutes,
    averageCookingMinutesPerCookingDay
  }
}

export function isDayMarkedEatOut(eatOutDays: readonly number[], dayIndex: number): boolean {
  return eatOutDays.includes(dayIndex)
}
