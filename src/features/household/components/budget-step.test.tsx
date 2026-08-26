import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { formatVnd, parseVnd } from "../budget-vnd"
import { BudgetStep } from "./budget-step"

describe("VND helpers", () => {
  it("parses plain or Vietnamese-grouped whole VND deterministically", () => {
    expect(parseVnd("1500000")).toBe(1_500_000)
    expect(parseVnd("1.500.000")).toBe(1_500_000)
    expect(parseVnd("1,500,000")).toBe(1_500_000)
    expect(parseVnd("1.5 triệu")).toBeNull()
  })

  it("formats whole VND without decimals", () => {
    expect(formatVnd(1_500_000)).toBe("1.500.000")
  })
})

describe("BudgetStep", () => {
  it("states the exact seven-primary-meal scope and formats valid input", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    function Harness() {
      const [value, setValue] = useState("")
      return (
        <BudgetStep
          value={value}
          onBack={vi.fn()}
          onChange={(nextValue) => {
            onChange(nextValue)
            setValue(nextValue)
          }}
          onContinue={vi.fn()}
        />
      )
    }
    render(<Harness />)

    expect(
      screen.getByText("Ngân sách này chỉ áp dụng cho 7 bữa chính trong tuần.")
    ).toBeInTheDocument()
    const input = screen.getByRole("textbox", { name: "Ngân sách tuần (VND)" })
    expect(input).toHaveAttribute("inputmode", "numeric")
    await user.type(input, "1500000")
    expect(onChange).toHaveBeenLastCalledWith("1500000")
  })

  it.each(["0", "100000001", "not-money"])("blocks invalid budget %s", (value) => {
    render(<BudgetStep value={value} onBack={vi.fn()} onChange={vi.fn()} onContinue={vi.fn()} />)

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeDisabled()
  })
})
