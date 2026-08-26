import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { HOUSEHOLD_RULE_OPTIONS } from "@/domain/household/household-rules"

import { PreferencesTimeStep } from "./preferences-time-step"

describe("PreferencesTimeStep", () => {
  it("renders only canonical soft preferences and exact elapsed-time choices", () => {
    render(
      <PreferencesTimeStep
        hardRuleCodes={[]}
        maxElapsedMinutes={30}
        selectedCodes={[]}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        onTimeChange={vi.fn()}
        onToggle={vi.fn()}
      />
    )

    const preferenceLabels = HOUSEHOLD_RULE_OPTIONS.filter(
      (option) => option.ruleKind === "soft_preference"
    ).map((option) => option.labelVi)
    expect(
      screen.getAllByRole("checkbox").map((checkbox) => checkbox.getAttribute("aria-label"))
    ).toEqual(preferenceLabels)
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual([
      "15 phút",
      "30 phút",
      "45 phút",
      "60 phút",
      "90 phút",
      "120 phút"
    ])
  })

  it("blocks a soft preference that conflicts with a hard target", async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(
      <PreferencesTimeStep
        hardRuleCodes={["exclude_pork"]}
        maxElapsedMinutes={30}
        selectedCodes={["prefer_pork"]}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        onTimeChange={vi.fn()}
        onToggle={onToggle}
      />
    )

    expect(screen.getByRole("alert")).toHaveTextContent(/thịt heo.*vừa loại trừ.*vừa ưu tiên/i)
    expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeDisabled()
    const conflictingPreference = screen.getByRole("checkbox", { name: "Ưu tiên thịt heo" })
    expect(conflictingPreference).toBeEnabled()
    await user.click(conflictingPreference)
    expect(onToggle).toHaveBeenCalledWith("prefer_pork", false)

    await user.click(screen.getByRole("radio", { name: "45 phút" }))
    expect(screen.getByRole("radio", { name: "45 phút" })).toBeInTheDocument()
  })
})
