import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { HOUSEHOLD_RULE_OPTIONS } from "@/domain/household/household-rules"

import { HardRulesStep } from "./hard-rules-step"

describe("HardRulesStep", () => {
  it("renders canonical hard options in sort order and keeps them separate from preferences", () => {
    render(
      <HardRulesStep
        selectedCodes={[]}
        allergenStrictness={{}}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        onToggle={vi.fn()}
        onStrictnessChange={vi.fn()}
      />
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
      <HardRulesStep
        selectedCodes={[]}
        allergenStrictness={{}}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        onToggle={onToggle}
        onStrictnessChange={vi.fn()}
      />
    )

    await user.click(screen.getByRole("checkbox", { name: "Dị ứng khác chưa có trong danh sách" }))
    expect(onToggle).toHaveBeenCalledWith("allergen_other", true)

    rerender(
      <HardRulesStep
        selectedCodes={["allergen_other"]}
        allergenStrictness={{}}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        onToggle={onToggle}
        onStrictnessChange={vi.fn()}
      />
    )
    expect(screen.getByRole("alert")).toHaveTextContent(/chưa được hỗ trợ/i)
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })
})

describe("HardRulesStep allergen reach", () => {
  const step = (
    selectedCodes: readonly string[],
    allergenStrictness: Record<string, "strict" | "ingredient_only">,
    onStrictnessChange = vi.fn()
  ) => (
    <HardRulesStep
      selectedCodes={selectedCodes}
      allergenStrictness={allergenStrictness}
      onBack={vi.fn()}
      onContinue={vi.fn()}
      onToggle={vi.fn()}
      onStrictnessChange={onStrictnessChange}
    />
  )

  it("asks nothing until an allergy is selected", () => {
    render(step([], {}))

    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
  })

  it("asks only about the allergies the household selected", () => {
    render(step(["allergen_peanut"], {}))

    expect(screen.getAllByRole("radio")).toHaveLength(2)
    expect(screen.getByRole("group", { name: "Mức độ cho Dị ứng đậu phộng" })).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: /Dị ứng cá/ })).not.toBeInTheDocument()
  })

  it("does not ask about an allergy the catalog cannot reason about", () => {
    render(step(["allergen_other"], {}))

    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
  })

  it("preselects the stricter reading when the household has not answered", () => {
    render(step(["allergen_peanut"], {}))

    const [strict, ingredientOnly] = screen.getAllByRole("radio")

    expect(strict).toBeChecked()
    expect(ingredientOnly).not.toBeChecked()
  })

  it("shows a stored answer", () => {
    render(step(["allergen_peanut"], { allergen_peanut: "ingredient_only" }))

    const [strict, ingredientOnly] = screen.getAllByRole("radio")

    expect(strict).not.toBeChecked()
    expect(ingredientOnly).toBeChecked()
  })

  it("reports the household's choice for the allergy it belongs to", async () => {
    const user = userEvent.setup()
    const onStrictnessChange = vi.fn()
    render(step(["allergen_peanut", "allergen_fish"], {}, onStrictnessChange))

    const fishGroup = screen.getByRole("group", { name: "Mức độ cho Dị ứng cá" })
    await user.click(within(fishGroup).getByRole("radio", { name: /chỉ loại món có dùng/i }))

    expect(onStrictnessChange).toHaveBeenCalledWith("allergen_fish", "ingredient_only")
  })

  it("says why the question is being asked", () => {
    render(step(["allergen_peanut"], {}))

    expect(screen.getByText(/không kiểm chứng được khâu chế biến/i)).toBeInTheDocument()
  })
})
