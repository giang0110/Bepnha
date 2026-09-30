export interface CalendarExportItem {
  readonly dayIndex: number
  readonly mealName: string
  readonly dishes: readonly string[]
}

function formatDateToIsoDay(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number)
  if (y === undefined || m === undefined || d === undefined) {
    return isoDate.replaceAll("-", "")
  }
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return formatDateToIsoDay(date)
}

/**
 * Generates an RFC 5545 compliant iCalendar string (.ics) for the weekly dinner plan.
 */
export function generateWeeklyPlanIcs(
  weekStartIso: string,
  items: readonly CalendarExportItem[]
): string {
  const now = new Date()
  const dtstamp = `${formatDateToIsoDay(now)}T000000Z`

  const events = items.map((item) => {
    const dayStr = addDaysToIsoDate(weekStartIso, item.dayIndex)
    const dtstart = `${dayStr}T183000`
    const dtend = `${dayStr}T193000`
    const uid = `bepnha-${weekStartIso}-${item.dayIndex}-${dayStr}@bepnha.app`
    const summary = `Bữa tối Bếp Nhà: ${item.mealName}`
    const dishList = item.dishes.length > 0 ? item.dishes.map((d) => `- ${d}`).join("\\n") : ""
    const description = `Thực đơn gia đình:\\n${dishList}\\n\\n💡 Nhắc nhở: Nhớ kiểm tra nguyên liệu và rã đông trước khi nấu.`

    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      "END:VEVENT"
    ].join("\r\n")
  })

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BepNha//Weekly Meal Plan//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR"
  ].join("\r\n")
}

export interface GoogleCalendarParam {
  readonly dateStr: string
  readonly mealName: string
  readonly dishes: readonly string[]
}

export function generateGoogleCalendarUrl(param: GoogleCalendarParam): string {
  const dateCompact = param.dateStr.replaceAll("-", "")
  const dates = `${dateCompact}T183000/${dateCompact}T193000`
  const text = `Bữa tối Bếp Nhà: ${param.mealName}`
  const dishList = param.dishes.length > 0 ? param.dishes.map((d) => `• ${d}`).join("\n") : ""
  const details = `Thực đơn gia đình:\n${dishList}\n\n💡 Bếp Nhà: Chúc gia đình có một bữa cơm ngon miệng!`

  const searchParams = new URLSearchParams({
    action: "TEMPLATE",
    text,
    dates,
    details
  })

  return `https://calendar.google.com/calendar/render?${searchParams.toString()}`
}
