import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { DailyPrepDefrostCard } from "./daily-prep-defrost-card"
import type { PrepTask } from "@/domain/planner/meal-prep-defrost"

describe("DailyPrepDefrostCard", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const sampleTasks: PrepTask[] = [
    {
      id: "defrost:0:ca-dieu-hong",
      type: "defrost",
      titleVi: "Rã đông: Cá diêu hồng",
      detailVi: "Lấy Cá diêu hồng (600 g) từ ngăn đông xuống ngăn mát tủ lạnh.",
      foodNameVi: "Cá diêu hồng",
      quantityLabel: "600 g",
      timingHintVi: "Trước 6–8 tiếng (từ buổi sáng)"
    },
    {
      id: "rice:0",
      type: "rice",
      titleVi: "Cắm nồi cơm điện",
      detailVi: "Vo và cắm cơm: Gạo tẻ (~2,5 bát đong) trước bữa ăn.",
      timingHintVi: "Trước giờ ăn 35–45 phút"
    }
  ]

  test("does not render when tasks array is empty", () => {
    render(
      <DailyPrepDefrostCard
        revisionId="rev-1"
        dayIndex={0}
        dayLabelVi="Thứ Hai"
        mealOptionNameVi="Cá diêu hồng rán giòn"
        tasks={[]}
      />
    )

    expect(screen.queryByTestId("daily-prep-defrost-card")).toBeNull()
  })

  test("renders prep card with defrost and rice tasks", () => {
    render(
      <DailyPrepDefrostCard
        revisionId="rev-1"
        dayIndex={0}
        dayLabelVi="Thứ Hai"
        mealOptionNameVi="Cá diêu hồng rán giòn"
        tasks={sampleTasks}
      />
    )

    expect(screen.getByTestId("daily-prep-defrost-card")).toBeInTheDocument()
    expect(screen.getByText(/Chuẩn bị & Rã đông sớm/i)).toBeInTheDocument()
    expect(screen.getByText("Rã đông: Cá diêu hồng")).toBeInTheDocument()
    expect(screen.getByText("Cắm nồi cơm điện")).toBeInTheDocument()
  })

  test("toggles task completion and persists check state", async () => {
    const user = userEvent.setup()
    render(
      <DailyPrepDefrostCard
        revisionId="rev-1"
        dayIndex={0}
        dayLabelVi="Thứ Hai"
        mealOptionNameVi="Cá diêu hồng rán giòn"
        tasks={sampleTasks}
      />
    )

    const defrostCheckbox = screen.getByTestId("prep-task-checkbox-defrost:0:ca-dieu-hong")
    expect(defrostCheckbox).not.toBeChecked()

    // Check task
    await user.click(defrostCheckbox)
    expect(defrostCheckbox).toBeChecked()

    // Uncheck task
    await user.click(defrostCheckbox)
    expect(defrostCheckbox).not.toBeChecked()
  })

  test("triggers onShareReminder callback when clicking send reminder button", async () => {
    const user = userEvent.setup()
    const handleShare = vi.fn()

    render(
      <DailyPrepDefrostCard
        revisionId="rev-1"
        dayIndex={0}
        dayLabelVi="Thứ Hai"
        mealOptionNameVi="Cá diêu hồng rán giòn"
        tasks={sampleTasks}
        onShareReminder={handleShare}
      />
    )

    const shareBtn = screen.getByTestId("share-prep-reminder-btn")
    await user.click(shareBtn)

    expect(handleShare).toHaveBeenCalledWith("Thứ Hai", "Cá diêu hồng rán giòn", sampleTasks)
  })
})
