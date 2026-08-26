import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { EMPTY_MEMBER_COUNTS, memberGroupsFromCounts } from "../household-form-state"
import { MemberGroupsStep } from "./member-groups-step"

describe("MemberGroupsStep", () => {
  it("renders every supported anonymous group with touch and keyboard labels", () => {
    render(
      <MemberGroupsStep counts={EMPTY_MEMBER_COUNTS} onChange={vi.fn()} onContinue={vi.fn()} />
    )

    for (const label of [
      "Người lớn",
      "Trẻ 1–3 tuổi",
      "Trẻ 4–6 tuổi",
      "Trẻ 7–9 tuổi",
      "Trẻ 10–12 tuổi",
      "Trẻ 13–17 tuổi",
      "Người cao tuổi"
    ]) {
      expect(screen.getByRole("spinbutton", { name: label })).toBeInTheDocument()
    }
    expect(screen.getByText("Hiện chưa hỗ trợ trẻ dưới 1 tuổi.")).toBeInTheDocument()
  })

  it("reports changes and allows totals from 1 through 20", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onContinue = vi.fn()
    const { rerender } = render(
      <MemberGroupsStep counts={EMPTY_MEMBER_COUNTS} onChange={onChange} onContinue={onContinue} />
    )

    expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeDisabled()
    const adultInput = screen.getByRole("spinbutton", { name: "Người lớn" })
    await user.clear(adultInput)
    await user.type(adultInput, "1")
    expect(onChange).toHaveBeenLastCalledWith("adult", 1)

    rerender(
      <MemberGroupsStep
        counts={{ ...EMPTY_MEMBER_COUNTS, adult: 20 }}
        onChange={onChange}
        onContinue={onContinue}
      />
    )
    expect(screen.getByText("Tổng cộng: 20 người")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it("blocks a total above 20 with an accessible error", () => {
    render(
      <MemberGroupsStep
        counts={{ ...EMPTY_MEMBER_COUNTS, adult: 20, elderly: 1 }}
        onChange={vi.fn()}
        onContinue={vi.fn()}
      />
    )

    expect(screen.getByRole("alert")).toHaveTextContent("Tối đa 20 thành viên")
    expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeDisabled()
  })

  it("omits zero-count groups from the domain draft", () => {
    expect(memberGroupsFromCounts({ ...EMPTY_MEMBER_COUNTS, child_7_9: 2 })).toEqual([
      { memberKind: "child", ageBand: "7_9", memberCount: 2 }
    ])
  })
})
