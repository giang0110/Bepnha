import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { HOUSEHOLD_RULE_OPTIONS } from "@/domain/household/household-rules"

import { HardRulesStep } from "./hard-rules-step"

describe("HardRulesStep", () => {
  it("renders canonical hard options in sort order and keeps them separate from preferences", () => {
    render(
      <HardRulesStep selectedCodes={[]} onBack={vi.fn()} onContinue={vi.fn()} onToggle={vi.fn()} />
    )

    const hardLabels = HOUSEHOLD_RULE_OPTIONS.filter(
      (option) => option.ruleKind !== "soft_preference"
    ).map((option) => option.labelVi)
    const checkboxes = screen.getAllByRole("checkbox")

    expect(checkboxes.map((checkbox) => checkbox.getAttribute("aria-label"))).toEqual(hardLabels)
    expect(screen.getByRole("heading", { name: "Dị ứng và loại trừ" })).toBeInTheDocument()
    expect(screen.queryByText("Ưu tiên thịt heo")).not.toBeInTheDocument()
    expect(screen.getByText(/lọc theo các loại trừ đã lưu/i)).toBeInTheDocument()
  })

  it("shows fixed unsupported-allergen guidance without accepting free text", async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const { rerender } = render(
      <HardRulesStep selectedCodes={[]} onBack={vi.fn()} onContinue={vi.fn()} onToggle={onToggle} />
    )

    await user.click(screen.getByRole("checkbox", { name: "Dị ứng khác chưa có trong danh sách" }))
    expect(onToggle).toHaveBeenCalledWith("allergen_other", true)

    rerender(
      <HardRulesStep
        selectedCodes={["allergen_other"]}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        onToggle={onToggle}
      />
    )
    expect(screen.getByRole("alert")).toHaveTextContent(/chưa được hỗ trợ/i)
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })
})
