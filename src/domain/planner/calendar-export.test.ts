import { describe, expect, it } from "vitest"
import {
  generateWeeklyPlanIcs,
  generateGoogleCalendarUrl,
  type CalendarExportItem
} from "./calendar-export"

describe("calendar-export", () => {
  const mockItems: readonly CalendarExportItem[] = [
    {
      dayIndex: 0, // Monday
      mealName: "Cơm gà kho gừng, rau muống luộc",
      dishes: ["Cơm trắng", "Gà kho gừng", "Rau muống luộc"]
    },
    {
      dayIndex: 1, // Tuesday
      mealName: "Cơm sườn ram mặn, canh cải thảo",
      dishes: ["Cơm trắng", "Sườn ram mặn", "Canh cải thảo"]
    }
  ]

  it("generates a valid RFC 5545 iCalendar string for planned meals", () => {
    const ics = generateWeeklyPlanIcs("2026-09-28", mockItems)

    expect(ics).toContain("BEGIN:VCALENDAR")
    expect(ics).toContain("VERSION:2.0")
    expect(ics).toContain("PRODID:-//BepNha//Weekly Meal Plan//VI")
    expect(ics).toContain("BEGIN:VEVENT")
    expect(ics).toContain("SUMMARY:Bữa tối Bếp Nhà: Cơm gà kho gừng, rau muống luộc")
    expect(ics).toContain("DTSTART:20260928T183000")
    expect(ics).toContain("DTEND:20260928T193000")
    expect(ics).toContain("SUMMARY:Bữa tối Bếp Nhà: Cơm sườn ram mặn, canh cải thảo")
    expect(ics).toContain("DTSTART:20260929T183000")
    expect(ics).toContain("END:VCALENDAR")
  })

  it("generates a valid Google Calendar URL for a meal", () => {
    const url = generateGoogleCalendarUrl({
      dateStr: "2026-09-28",
      mealName: "Cơm gà kho gừng",
      dishes: ["Cơm trắng", "Gà kho gừng"]
    })

    expect(url).toContain("https://calendar.google.com/calendar/render?action=TEMPLATE")
    expect(url).toContain(
      "text=B%E1%BB%AFa+t%E1%BB%91i+B%E1%BA%BFp+Nh%C3%A0%3A+C%C6%A1m+g%C3%A0+kho+g%E1%BB%ABng"
    )
    expect(url).toContain("dates=20260928T183000%2F20260928T193000")
  })
})
