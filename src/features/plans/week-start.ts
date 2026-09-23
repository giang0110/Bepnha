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
