import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { FamilyCollaborationModal } from "./family-collaboration-modal"
import type { FamilyMealWish } from "@/domain/planner/family-meal-wishlist"

describe("FamilyCollaborationModal", () => {
  const initialWishes: FamilyMealWish[] = [
    {
      mealOptionId: "opt-1",
      mealOptionNameVi: "Canh chua cá lóc",
      requestedBy: "Bố",
      voteCount: 1,
      note: "Thèm ăn chua giải nhiệt",
      createdAtIso: "2026-09-30T10:00:00Z"
    }
  ]

  const mockPlanItems = [
    { dayIndex: 0, mealOptionNameVi: "Thịt kho trứng", elapsedMinutes: 30 },
    { dayIndex: 1, mealOptionNameVi: "Canh cá nấu chua", elapsedMinutes: 35 }
  ]

  beforeEach(() => {
    window.localStorage.clear()
  })

  it("renders modal with family wishes and announcement tabs", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <FamilyCollaborationModal
        isOpen={true}
        householdId="hh-test"
        householdName="Nhà Mình"
        weekStart="2026-09-21"
        planItems={mockPlanItems}
        availableMealOptions={[
          { id: "opt-1", nameVi: "Canh chua cá lóc" },
          { id: "opt-2", nameVi: "Bò sốt vang" }
        ]}
        initialWishes={initialWishes}
        onClose={onClose}
      />
    )

    expect(screen.getByText("Gia đình & Chia sẻ thực đơn")).toBeInTheDocument()
    expect(screen.getAllByText("Canh chua cá lóc")[0]).toBeInTheDocument()
    expect(screen.getByText(/Thèm ăn chua giải nhiệt/)).toBeInTheDocument()
    expect(screen.getByText(/Đề xuất bởi: Bố/)).toBeInTheDocument()

    // Switch to tab "Gửi thực đơn cho cả nhà"
    await user.click(screen.getByRole("tab", { name: /Gửi thực đơn cho cả nhà/i }))
    expect(screen.getByText(/THỰC ĐƠN BẾP NHÀ TUẦN NÀY - NHÀ MÌNH/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Sao chép tin nhắn Zalo/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Xuất file Lịch \(\.ics\)/i })).toBeInTheDocument()
  })

  it("allows adding a new family wish and upvoting", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <FamilyCollaborationModal
        isOpen={true}
        householdId="hh-test"
        householdName="Nhà Mình"
        weekStart="2026-09-21"
        planItems={mockPlanItems}
        availableMealOptions={[
          { id: "opt-1", nameVi: "Canh chua cá lóc" },
          { id: "opt-2", nameVi: "Bò sốt vang" }
        ]}
        initialWishes={initialWishes}
        onClose={onClose}
      />
    )

    // Upvote the existing wish
    const upvoteBtn = screen.getByRole("button", { name: /Thả tim món Canh chua cá lóc/i })
    await user.click(upvoteBtn)

    // Should increment vote count
    await waitFor(() => {
      expect(screen.getByText("2")).toBeInTheDocument()
    })

    // Fill the add wish form
    const select = screen.getByLabelText(/Chọn món muốn ăn/i)
    await user.selectOptions(select, "opt-2")

    const memberInput = screen.getByPlaceholderText(/Ví dụ: Bé Bắp, Mẹ, Bố/i)
    await user.type(memberInput, "Bé Bắp")

    const addBtn = screen.getByRole("button", { name: /Thêm nguyện vọng/i })
    await user.click(addBtn)

    // Should now show Bò sốt vang in the list
    const boSotVangElements = await screen.findAllByText("Bò sốt vang")
    expect(boSotVangElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Đề xuất bởi: Bé Bắp/)).toBeInTheDocument()
  })

  it("allows entering a custom dish craving not in the options list", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <FamilyCollaborationModal
        isOpen={true}
        householdId="hh-test"
        householdName="Nhà Mình"
        weekStart="2026-09-21"
        planItems={mockPlanItems}
        availableMealOptions={[{ id: "opt-1", nameVi: "Canh chua cá lóc" }]}
        onClose={onClose}
      />
    )

    // Select custom option
    const select = screen.getByLabelText(/Chọn món muốn ăn/i)
    await user.selectOptions(select, "custom")

    // Input custom dish name
    const customInput = screen.getByLabelText(/Tên món muốn ăn/i)
    await user.type(customInput, "Sườn xào chua ngọt")

    const memberInput = screen.getByPlaceholderText(/Ví dụ: Bé Bắp, Mẹ, Bố/i)
    await user.type(memberInput, "Mẹ")

    const noteInput = screen.getByPlaceholderText(/Ví dụ: Thèm lâu rồi/i)
    await user.type(noteInput, "Món này cả nhà đều thích")

    const addBtn = screen.getByRole("button", { name: /Thêm nguyện vọng/i })
    await user.click(addBtn)

    // Should display the custom dish in wishlist
    expect(await screen.findByText("Sườn xào chua ngọt")).toBeInTheDocument()
    expect(screen.getByText(/Đề xuất bởi: Mẹ/)).toBeInTheDocument()
    expect(screen.getByText(/Món này cả nhà đều thích/)).toBeInTheDocument()
  })
})
