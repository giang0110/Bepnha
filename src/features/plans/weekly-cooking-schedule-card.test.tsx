import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import {
  WeeklyCookingScheduleCard,
  type WeeklyCookingScheduleCardProps
} from "./weekly-cooking-schedule-card"

describe("WeeklyCookingScheduleCard", () => {
  const sampleItems: WeeklyCookingScheduleCardProps["items"] = [
    { dayIndex: 0, mealOptionNameVi: "Thịt băm xào hành & Canh cải", elapsedMinutes: 25 },
    { dayIndex: 1, mealOptionNameVi: "Cá diêu hồng rán giòn & Canh chua", elapsedMinutes: 35 },
    { dayIndex: 2, mealOptionNameVi: "Trứng đúc thịt & Rau muống luộc", elapsedMinutes: 20 },
    { dayIndex: 3, mealOptionNameVi: "Sườn ram mặn ngọt & Canh bí đỏ", elapsedMinutes: 40 },
    { dayIndex: 4, mealOptionNameVi: "Đậu sốt cà chua & Canh mồng tơi", elapsedMinutes: 30 },
    { dayIndex: 5, mealOptionNameVi: "Thịt kho tàu nước dừa & Dưa chua", elapsedMinutes: 55 },
    { dayIndex: 6, mealOptionNameVi: "Bò kho gừng xả & Canh bắp cải", elapsedMinutes: 60 }
  ]

  test("renders empty state or does not crash when items array is empty", () => {
    render(<WeeklyCookingScheduleCard items={[]} />)
    expect(screen.queryByTestId("weekly-cooking-schedule-card")).toBeNull()
  })

  test("renders cooking schedule metrics, total time, and day items", () => {
    render(<WeeklyCookingScheduleCard items={sampleItems} />)

    const card = screen.getByTestId("weekly-cooking-schedule-card")
    expect(card).toBeInTheDocument()

    // Title
    expect(screen.getByText("Thời gian nấu & Lịch trình tuần")).toBeInTheDocument()

    // Total time: 265 mins -> 4 giờ 25 phút
    expect(screen.getByText("4 giờ 25 phút")).toBeInTheDocument()

    // Average time: 38 phút
    expect(screen.getByText("~38 phút")).toBeInTheDocument()

    // Quick meal count: 3 bữa ⚡
    expect(screen.getByText("3 bữa ⚡")).toBeInTheDocument()

    // Days rendered
    expect(screen.getByText("Thứ Hai")).toBeInTheDocument()
    expect(screen.getByText("Chủ Nhật")).toBeInTheDocument()
  })

  test("triggers onSelectDay callback when a day row is clicked", async () => {
    const user = userEvent.setup()
    const handleSelectDay = vi.fn()

    render(<WeeklyCookingScheduleCard items={sampleItems} onSelectDay={handleSelectDay} />)

    const wednesdayBtn = screen.getByTestId("cooking-schedule-day-2")
    await user.click(wednesdayBtn)

    expect(handleSelectDay).toHaveBeenCalledWith(2)
  })

  test("toggles collapsible schedule details when expand/collapse button is clicked", async () => {
    const user = userEvent.setup()
    render(<WeeklyCookingScheduleCard items={sampleItems} />)

    const toggleBtn = screen.getByTestId("toggle-cooking-schedule-details")
    expect(toggleBtn).toBeInTheDocument()
    expect(toggleBtn).toHaveAttribute("aria-expanded", "true")

    // Collapse
    await user.click(toggleBtn)
    expect(toggleBtn).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByTestId("cooking-schedule-timeline")).toBeNull()

    // Re-expand
    await user.click(toggleBtn)
    expect(toggleBtn).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByTestId("cooking-schedule-timeline")).toBeInTheDocument()
  })

  test("renders eat-out days on schedule timeline and recalculates cooking duration", () => {
    render(<WeeklyCookingScheduleCard items={sampleItems} eatOutDays={[5, 6]} />)

    // 5 home-cooking days: 25+35+20+40+30 = 150 mins -> 2 giờ 30 phút
    expect(screen.getByText("2 giờ 30 phút")).toBeInTheDocument()
    expect(screen.getByText("5 ngày nấu · 2 ngày ăn ngoài")).toBeInTheDocument()

    // Saturday & Sunday have "Ăn ngoài 🍜" badge
    const saturdayBtn = screen.getByTestId("cooking-schedule-day-5")
    expect(saturdayBtn).toHaveTextContent("Ăn ngoài 🍜")
    expect(saturdayBtn).toHaveTextContent("Nghỉ nấu")
  })
})
