import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"

import { KitchenMeasurementModal } from "./kitchen-measurement-modal"

describe("KitchenMeasurementModal", () => {
  test("renders modal when open and handles close action", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    const { rerender } = render(<KitchenMeasurementModal isOpen={false} onClose={onClose} />)
    expect(screen.queryByTestId("kitchen-measurement-modal")).not.toBeInTheDocument()

    rerender(<KitchenMeasurementModal isOpen={true} onClose={onClose} />)
    expect(screen.getByTestId("kitchen-measurement-modal")).toBeInTheDocument()
    expect(screen.getByText("Quy đổi đơn vị & Ước lượng bếp Việt")).toBeInTheDocument()

    const closeBtn = screen.getByRole("button", { name: "Đóng" })
    await user.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test("calculates conversion dynamically when user changes inputs", async () => {
    const user = userEvent.setup()
    render(<KitchenMeasurementModal isOpen={true} onClose={vi.fn()} />)

    // Select fish sauce
    const ingredientSelect = screen.getByTestId("converter-ingredient-select")
    await user.selectOptions(ingredientSelect, "fish_sauce")

    // From unit: tbsp
    const fromUnitSelect = screen.getByTestId("converter-from-unit-select")
    await user.selectOptions(fromUnitSelect, "tbsp")

    // To unit: gram
    const toUnitSelect = screen.getByTestId("converter-to-unit-select")
    await user.selectOptions(toUnitSelect, "gram")

    // Input amount: 2
    const amountInput = screen.getByTestId("converter-amount-input")
    await user.clear(amountInput)
    await user.type(amountInput, "2")

    // 2 tbsp fish sauce = 34 g
    const resultBox = screen.getByTestId("converter-result-display")
    expect(resultBox).toHaveTextContent("34 g")
  })

  test("switches between converter calculator, seasoning sheet, and hand estimate tabs", async () => {
    const user = userEvent.setup()
    render(<KitchenMeasurementModal isOpen={true} onClose={vi.fn()} />)

    // Default tab is calculator
    expect(screen.getByTestId("converter-calculator-panel")).toBeInTheDocument()

    // Switch to seasoning sheet
    const seasoningTab = screen.getByRole("button", { name: /Bảng gia vị/i })
    await user.click(seasoningTab)
    expect(screen.getByTestId("seasoning-sheet-panel")).toBeInTheDocument()
    expect(screen.getByText(/Nước mắm/i)).toBeInTheDocument()
    expect(screen.getByText(/Muối ăn/i)).toBeInTheDocument()

    // Switch to hand estimates & aromatics
    const handTab = screen.getByRole("button", { name: /Ước lượng bàn tay/i })
    await user.click(handTab)
    expect(screen.getByTestId("hand-estimate-panel")).toBeInTheDocument()
    expect(screen.getByText(/1 Lòng bàn tay/i)).toBeInTheDocument()
    expect(screen.getByText(/Tỏi củ & Tép tỏi/i)).toBeInTheDocument()
  })

  test("applies quick presets and swaps conversion units", async () => {
    const user = userEvent.setup()
    render(<KitchenMeasurementModal isOpen={true} onClose={vi.fn()} />)

    // Click quick preset: "1 bát con gạo"
    const presetBtn = screen.getByRole("button", { name: "1 bát con gạo" })
    await user.click(presetBtn)

    const resultBox = screen.getByTestId("converter-result-display")
    expect(resultBox).toHaveTextContent("150 g")

    // Click swap button
    const swapBtn = screen.getByTestId("converter-swap-btn")
    await user.click(swapBtn)

    // Now converting from gram to rice_bowl
    const fromUnitSelect = screen.getByTestId("converter-from-unit-select")
    const toUnitSelect = screen.getByTestId("converter-to-unit-select")
    expect(fromUnitSelect).toHaveValue("gram")
    expect(toUnitSelect).toHaveValue("rice_bowl")
  })
})
