import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { ShoppingActualExpenseCard } from "./shopping-actual-expense-card"

describe("ShoppingActualExpenseCard", () => {
  const defaultProps = {
    estimatedCostVnd: 700_000,
    budgetVnd: 1_000_000,
    pickedUpCostVnd: 680_000,
    actualExpense: null,
    onSaveActualExpense: vi.fn(),
    onClearActualExpense: vi.fn()
  }

  test("renders prompt button when no actual expense has been recorded yet", () => {
    render(<ShoppingActualExpenseCard {...defaultProps} />)

    expect(screen.getByTestId("open-actual-expense-btn")).toBeInTheDocument()
    expect(screen.getByText(/Ghi nhận thanh toán thực tế/i)).toBeInTheDocument()
  })

  test("opens form, enters amount, uses quick fill button and submits", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<ShoppingActualExpenseCard {...defaultProps} onSaveActualExpense={onSave} />)

    await user.click(screen.getByTestId("open-actual-expense-btn"))

    const input = screen.getByTestId("actual-expense-input")
    expect(input).toBeInTheDocument()

    // Test quick preset: use pickedUpCostVnd
    const quickPickedBtn = screen.getByRole("button", { name: /Đã nhặt: 680\.000 đ/i })
    await user.click(quickPickedBtn)
    expect(input).toHaveValue(680_000)

    // Type a note
    const noteInput = screen.getByTestId("actual-expense-note-input")
    await user.type(noteInput, "Mua ở chợ Hôm")

    // Submit
    await user.click(screen.getByTestId("save-actual-expense-btn"))
    expect(onSave).toHaveBeenCalledWith(680_000, "Mua ở chợ Hôm")
  })

  test("displays recorded expense card with variance badge and allows editing", async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    render(
      <ShoppingActualExpenseCard
        {...defaultProps}
        actualExpense={{
          actualCostVnd: 650_000,
          recordedAtIso: "2026-10-09T08:00:00.000Z",
          note: "Rau rẻ hơn dự kiến"
        }}
        onClearActualExpense={onClear}
      />
    )

    expect(screen.getByTestId("actual-expense-summary")).toBeInTheDocument()
    expect(screen.getByText("650.000 đ")).toBeInTheDocument()
    expect(screen.getByText(/Tiết kiệm 50\.000 đ/i)).toBeInTheDocument()
    expect(screen.getByText(/Rau rẻ hơn dự kiến/i)).toBeInTheDocument()

    // Clear expense
    await user.click(screen.getByTestId("clear-actual-expense-btn"))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  test("displays overage badge when actual cost exceeds estimate", () => {
    render(
      <ShoppingActualExpenseCard
        {...defaultProps}
        actualExpense={{
          actualCostVnd: 740_000,
          recordedAtIso: "2026-10-09T08:00:00.000Z"
        }}
      />
    )

    expect(screen.getByText("740.000 đ")).toBeInTheDocument()
    expect(screen.getByText(/Vượt dự tính 40\.000 đ/i)).toBeInTheDocument()
  })
})
