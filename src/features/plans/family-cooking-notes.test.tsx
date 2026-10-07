import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { FamilyCookingNotes } from "./family-cooking-notes"
import { saveCookingNote } from "./cooking-notes-store"

describe("FamilyCookingNotes", () => {
  const mealOptionId = "meal-thit-kho"

  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it("renders empty state when no note exists", () => {
    render(<FamilyCookingNotes mealOptionId={mealOptionId} />)

    expect(screen.getByText(/Mẹo & Ghi chú của gia đình/i)).toBeInTheDocument()
    expect(screen.getByText(/Chưa có ghi chú khẩu vị/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /\+ Thêm ghi chú/i })).toBeInTheDocument()
  })

  it("displays existing stored cooking note", () => {
    saveCookingNote(window.localStorage, mealOptionId, "Bé thích ăn trứng cút hơn trứng vịt")

    render(<FamilyCookingNotes mealOptionId={mealOptionId} mealOptionNameVi="Thịt kho tàu" />)

    expect(screen.getByText(/Thịt kho tàu/i)).toBeInTheDocument()
    expect(screen.getByText("Bé thích ăn trứng cút hơn trứng vịt")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Sửa ghi chú/i })).toBeInTheDocument()
  })

  it("allows adding and saving a new cooking note", async () => {
    const user = userEvent.setup()
    const handleNoteChange = vi.fn()

    render(<FamilyCookingNotes mealOptionId={mealOptionId} onNoteChange={handleNoteChange} />)

    await user.click(screen.getByRole("button", { name: /\+ Thêm ghi chú/i }))

    const textarea = screen.getByLabelText(/Nội dung ghi chú món ăn/i)
    await user.type(textarea, "Ướp thịt với 1 muỗng nước mắm trước 20 phút")

    await user.click(screen.getByTestId("save-cooking-note-btn"))

    expect(screen.getByText("Ướp thịt với 1 muỗng nước mắm trước 20 phút")).toBeInTheDocument()
    expect(handleNoteChange).toHaveBeenCalledWith("Ướp thịt với 1 muỗng nước mắm trước 20 phút")
    expect(screen.getByRole("status")).toHaveTextContent("✓ Đã lưu ghi chú cho món này")
  })

  it("allows editing an existing note and cancelling without saving", async () => {
    const user = userEvent.setup()
    saveCookingNote(window.localStorage, mealOptionId, "Ghi chú ban đầu")

    render(<FamilyCookingNotes mealOptionId={mealOptionId} />)

    await user.click(screen.getByRole("button", { name: /Sửa ghi chú/i }))
    const textarea = screen.getByLabelText(/Nội dung ghi chú món ăn/i)
    await user.clear(textarea)
    await user.type(textarea, "Thay đổi nhưng bấm hủy")

    await user.click(screen.getByRole("button", { name: /Hủy/i }))

    expect(screen.getByText("Ghi chú ban đầu")).toBeInTheDocument()
    expect(screen.queryByText("Thay đổi nhưng bấm hủy")).not.toBeInTheDocument()
  })

  it("allows clearing an existing note", async () => {
    const user = userEvent.setup()
    saveCookingNote(window.localStorage, mealOptionId, "Ghi chú cần xóa")
    const handleNoteChange = vi.fn()

    render(<FamilyCookingNotes mealOptionId={mealOptionId} onNoteChange={handleNoteChange} />)

    await user.click(screen.getByRole("button", { name: /Sửa ghi chú/i }))
    await user.click(screen.getByTestId("clear-cooking-note-btn"))

    expect(screen.getByText(/Chưa có ghi chú khẩu vị/i)).toBeInTheDocument()
    expect(handleNoteChange).toHaveBeenCalledWith(null)
  })
})
