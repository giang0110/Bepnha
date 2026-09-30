import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { BudgetPresets } from "./budget-presets"

describe("BudgetPresets", () => {
  it("offers common seven-meal budgets and reports exact whole VND", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<BudgetPresets selectedVnd={700_000} onSelect={onSelect} />)

    expect(screen.getByRole("button", { name: "700.000 VND" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await user.click(screen.getByRole("button", { name: "1.000.000 VND" }))
    expect(onSelect).toHaveBeenCalledWith(1_000_000)
  })
})
