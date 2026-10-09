import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { EatOutModal } from "./eat-out-modal"

describe("EatOutModal", () => {
  it("does not render when isOpen is false", () => {
    const { container } = render(
      <EatOutModal
        isOpen={false}
        dayIndex={5}
        dayLabelVi="Thứ Bảy"
        mealOptionNameVi="Lẩu gà lá é"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("renders with day label and preset reason chips", () => {
    render(
      <EatOutModal
        isOpen={true}
        dayIndex={5}
        dayLabelVi="Thứ Bảy"
        mealOptionNameVi="Lẩu gà lá é"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/Đánh dấu ăn ngoài /i)).toBeInTheDocument()
    expect(screen.getByText(/Thứ Bảy/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ăn tiệc / Liên hoan" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Về quê thăm gia đình" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ăn ngoài đổi gió" })).toBeInTheDocument()
  })

  it("selects a preset chip and populates input", () => {
    render(
      <EatOutModal
        isOpen={true}
        dayIndex={5}
        dayLabelVi="Thứ Bảy"
        mealOptionNameVi="Lẩu gà lá é"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    const presetChip = screen.getByRole("button", { name: "Ăn tiệc / Liên hoan" })
    fireEvent.click(presetChip)

    const input = screen.getByPlaceholderText(/Ví dụ: Đi ăn cỗ/i)
    expect(input).toHaveValue("Ăn tiệc / Liên hoan")
  })

  it("calls onConfirm with reason when confirm button is clicked", () => {
    const onConfirmMock = vi.fn()
    render(
      <EatOutModal
        isOpen={true}
        dayIndex={6}
        dayLabelVi="Chủ Nhật"
        mealOptionNameVi="Bún bò Huế"
        onConfirm={onConfirmMock}
        onClose={vi.fn()}
      />
    )

    const input = screen.getByPlaceholderText(/Ví dụ: Đi ăn cỗ/i)
    fireEvent.change(input, { target: { value: "Sinh nhật bạn thân" } })

    const confirmBtn = screen.getByRole("button", { name: /Xác nhận ăn ngoài/i })
    fireEvent.click(confirmBtn)

    expect(onConfirmMock).toHaveBeenCalledWith("Sinh nhật bạn thân")
  })

  it("calls onClose when cancel or backdrop close button is clicked", () => {
    const onCloseMock = vi.fn()
    render(
      <EatOutModal
        isOpen={true}
        dayIndex={6}
        dayLabelVi="Chủ Nhật"
        mealOptionNameVi="Bún bò Huế"
        onConfirm={vi.fn()}
        onClose={onCloseMock}
      />
    )

    const cancelBtn = screen.getByRole("button", { name: "Hủy bỏ" })
    fireEvent.click(cancelBtn)
    expect(onCloseMock).toHaveBeenCalledTimes(1)
  })
})
