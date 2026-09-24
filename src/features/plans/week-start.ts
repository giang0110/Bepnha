/**
 * The Monday the plan is for, as `YYYY-MM-DD`.
 *
 * Planning is always forward: on a Monday it is today, on any other day it is the Monday coming.
 * Shared rather than recomputed per page, because the plan screen and the cooking screen have to
 * ask the API for the *same* week — a second copy of this arithmetic that drifted by a day would
 * send a cook to a week with no meal in it.
 *
 * The clock is pinned to midday before any arithmetic so that a daylight-saving shift, which moves
 * a midnight date across the boundary, cannot change which day this lands on.
 */
export function planWeekStart(date: Date): string {
  const value = new Date(date)
  value.setHours(12, 0, 0, 0)
  const day = value.getDay()
  const distance = day === 1 ? 0 : (8 - day) % 7
  value.setDate(value.getDate() + distance)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const dateOfMonth = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${dateOfMonth}`
}

function mondayOnOrBefore(date: Date): Date {
  const value = new Date(date)
  value.setHours(12, 0, 0, 0)
  // getDay() is 0 for Sunday, so Sunday is six days after its Monday, not one day before the next.
  const back = (value.getDay() + 6) % 7
  value.setDate(value.getDate() - back)
  return value
}

function isoDate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const dayOfMonth = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${dayOfMonth}`
}

/**
 * The Monday of the week the household is living in right now.
 *
 * This is the week they are cooking from, and it is what the plan page is about. `planWeekStart`
 * always answers with the Monday *ahead*, which is right for deciding what to plan next and wrong
 * for everything else: used as the page's only question it meant that from Tuesday to Sunday the
 * app asked for a week that had not started, found nothing, and invited a household to plan a week
 * while the plan they were cooking from that day sat unreachable behind it.
 */
export function currentWeekStart(date: Date): string {
  return isoDate(mondayOnOrBefore(date))
}

/**
 * The Monday after the current one, always seven days on.
 *
 * Distinct from `planWeekStart`, which is already today on a Monday. Planning ahead has to mean a
 * different week from the one on screen, or the two choices would be the same choice.
 */
export function nextWeekStart(date: Date): string {
  const monday = mondayOnOrBefore(date)
  monday.setDate(monday.getDate() + 7)
  return isoDate(monday)
}
