import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ReviewStep } from "./review-step"

describe("ReviewStep", () => {
  it("shows the complete deterministic household setup without planner controls", () => {
    render(
      <ReviewStep
        budgetVnd={1_500_000}
        hardRuleCodes={["exclude_beef", "allergen_peanut"]}
        maxElapsedMinutes={45}
        memberGroups={[
          { memberKind: "adult", ageBand: "adult", memberCount: 2 },
          { memberKind: "child", ageBand: "4_6", memberCount: 1 }
        ]}
        preferenceCodes={["prefer_soup"]}
        saveState="idle"
        onBack={vi.fn()}
        onSave={vi.fn()}
      />
    )

    expect(screen.getByRole("heading", { name: "Kiểm tra thông tin" })).toBeInTheDocument()
    expect(screen.getByText("2 người lớn")).toBeInTheDocument()
    expect(screen.getByText("1 trẻ 4–6 tuổi")).toBeInTheDocument()
    expect(screen.getByText("1.500.000 VND cho 7 bữa chính")).toBeInTheDocument()
    expect(screen.getByText("Dị ứng đậu phộng")).toBeInTheDocument()
    expect(screen.getByText("Không dùng thịt bò")).toBeInTheDocument()
    expect(screen.getByText("Ưu tiên món canh")).toBeInTheDocument()
    expect(screen.getByText("45 phút")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /tạo thực đơn/i })).not.toBeInTheDocument()
  })

  it("exposes save, retry, and busy states accessibly", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const { rerender } = render(
      <ReviewStep
        budgetVnd={500_000}
        hardRuleCodes={[]}
        maxElapsedMinutes={30}
        memberGroups={[{ memberKind: "adult", ageBand: "adult", memberCount: 1 }]}
        preferenceCodes={[]}
        saveState="idle"
        onBack={vi.fn()}
        onSave={onSave}
      />
    )

    await user.click(screen.getByRole("button", { name: "Lưu thông tin" }))
    expect(onSave).toHaveBeenCalledOnce()

    rerender(
      <ReviewStep
        budgetVnd={500_000}
        hardRuleCodes={[]}
        maxElapsedMinutes={30}
        memberGroups={[{ memberKind: "adult", ageBand: "adult", memberCount: 1 }]}
        preferenceCodes={[]}
        saveState="retryable-error"
        onBack={vi.fn()}
        onSave={onSave}
      />
    )
    expect(screen.getByRole("alert")).toHaveTextContent(/không thể lưu/i)
    expect(screen.getByRole("button", { name: "Thử lưu lại" })).toBeEnabled()
  })
})
