import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

import { PantryCookingDeductionModal } from "./pantry-cooking-deduction-modal"
import type { CookingPantryDeductionResultItem } from "@/domain/pantry/pantry-cooking-deduction"

describe("PantryCookingDeductionModal", () => {
  const sampleItems: readonly CookingPantryDeductionResultItem[] = [
    {
      pantryItemId: "p-rice",
      foodId: "food-rice",
      foodNameVi: "Gạo tẻ",
      foodFactVersionId: "fact-rice-v1",
      unitId: "unit-g",
      unitNameVi: "gam",
      currentQuantity: "1000",
      usedQuantity: "400",
      remainingQuantity: "600",
      action: "update",
      expectedVersion: 1
    },
    {
      pantryItemId: "p-shallot",
      foodId: "food-shallot",
      foodNameVi: "Hành tím",
      foodFactVersionId: "fact-shallot-v1",
      unitId: "unit-g",
      unitNameVi: "gam",
      currentQuantity: "50",
      usedQuantity: "50",
      remainingQuantity: "0",
      action: "remove",
      expectedVersion: 2
    }
  ]

  test("renders nothing when isOpen is false", () => {
    const onConfirm = vi.fn()
    const onSkip = vi.fn()
    render(
      <PantryCookingDeductionModal
        items={sampleItems}
        isOpen={false}
        isSubmitting={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  test("renders modal with food names and deduction badges when isOpen is true", () => {
    const onConfirm = vi.fn()
    const onSkip = vi.fn()
    render(
      <PantryCookingDeductionModal
        items={sampleItems}
        isOpen={true}
        isSubmitting={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Bữa cơm đã hoàn thành!")).toBeInTheDocument()
    expect(screen.getByText("Gạo tẻ")).toBeInTheDocument()
    expect(screen.getByText("Hành tím")).toBeInTheDocument()
    expect(screen.getByText(/Còn 600 gam/)).toBeInTheDocument()
    expect(screen.getByText(/Dùng hết · Xoá khỏi tủ/)).toBeInTheDocument()
    expect(screen.getByText("Chọn 2/2")).toBeInTheDocument()
  })

  test("allows toggling selection and confirms only selected items", () => {
    const onConfirm = vi.fn()
    const onSkip = vi.fn()
    render(
      <PantryCookingDeductionModal
        items={sampleItems}
        isOpen={true}
        isSubmitting={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )

    // Uncheck "Hành tím"
    const checkboxes = screen.getAllByRole("checkbox")
    expect(checkboxes).toHaveLength(2)
    fireEvent.click(checkboxes[1]!) // Uncheck second item

    expect(screen.getByText("Chọn 1/2")).toBeInTheDocument()

    // Click confirm button
    const confirmBtn = screen.getByRole("button", { name: /Xác nhận trừ kho/ })
    fireEvent.click(confirmBtn)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith([sampleItems[0]])
  })

  test("select all and deselect all work properly", () => {
    const onConfirm = vi.fn()
    const onSkip = vi.fn()
    render(
      <PantryCookingDeductionModal
        items={sampleItems}
        isOpen={true}
        isSubmitting={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )

    // Initially all selected -> shows "Bỏ chọn tất cả"
    const deselectBtn = screen.getByRole("button", { name: "Bỏ chọn tất cả" })
    fireEvent.click(deselectBtn)

    expect(screen.getByText("Chọn 0/2")).toBeInTheDocument()

    // Confirm button should be disabled when 0 items selected
    const confirmBtn = screen.getByRole("button", { name: /Xác nhận trừ kho/ })
    expect(confirmBtn).toBeDisabled()

    // Now shows "Chọn tất cả"
    const selectAllBtn = screen.getByRole("button", { name: "Chọn tất cả" })
    fireEvent.click(selectAllBtn)

    expect(screen.getByText("Chọn 2/2")).toBeInTheDocument()
    expect(confirmBtn).not.toBeDisabled()
  })

  test("calls onSkip when clicking skip button", () => {
    const onConfirm = vi.fn()
    const onSkip = vi.fn()
    render(
      <PantryCookingDeductionModal
        items={sampleItems}
        isOpen={true}
        isSubmitting={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )

    const skipBtn = screen.getByRole("button", { name: /Bỏ qua/ })
    fireEvent.click(skipBtn)

    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  test("displays error message if present", () => {
    const onConfirm = vi.fn()
    const onSkip = vi.fn()
    render(
      <PantryCookingDeductionModal
        items={sampleItems}
        isOpen={true}
        isSubmitting={false}
        errorMessage="Không thể kết nối đến máy chủ"
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )

    expect(screen.getByRole("alert")).toHaveTextContent("Không thể kết nối đến máy chủ")
  })

  test("shows submitting indicator and disables actions during submission", () => {
    const onConfirm = vi.fn()
    const onSkip = vi.fn()
    render(
      <PantryCookingDeductionModal
        items={sampleItems}
        isOpen={true}
        isSubmitting={true}
        errorMessage={null}
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    )

    expect(screen.getByText("Đang trừ kho…")).toBeInTheDocument()
    const buttons = screen.getAllByRole("button")
    for (const btn of buttons) {
      expect(btn).toBeDisabled()
    }
  })
})
