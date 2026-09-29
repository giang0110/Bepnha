import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { MemberCountStepper } from "./member-count-stepper"

describe("MemberCountStepper", () => {
  it("supports labelled touch controls and a numeric keyboard input", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <MemberCountStepper label="Người lớn" value={0} onChange={onChange} />
    )

    await user.click(screen.getByRole("button", { name: "Tăng Người lớn" }))
    expect(onChange).toHaveBeenLastCalledWith(1)

    rerender(<MemberCountStepper label="Người lớn" value={1} onChange={onChange} />)
    await user.click(screen.getByRole("button", { name: "Giảm Người lớn" }))
    expect(onChange).toHaveBeenLastCalledWith(0)
    expect(screen.getByRole("spinbutton", { name: "Người lớn" })).toHaveAttribute(
      "inputmode",
      "numeric"
    )
  })

  it("never emits values outside the supported 0–20 range", () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <MemberCountStepper label="Người lớn" value={0} onChange={onChange} />
    )

    expect(screen.getByRole("button", { name: "Giảm Người lớn" })).toBeDisabled()
    rerender(<MemberCountStepper label="Người lớn" value={20} onChange={onChange} />)
    expect(screen.getByRole("button", { name: "Tăng Người lớn" })).toBeDisabled()
  })
})
