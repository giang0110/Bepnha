import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { describe, expect, it, vi } from "vitest"

import type { HouseholdRepository } from "@/application/household/household-repository"

import { OnboardingPage } from "./onboarding-page"

const householdRepository: HouseholdRepository = {
  loadOwn: () => Promise.resolve(null),
  saveOwn: () => Promise.resolve({ ok: false, reason: "DEPENDENCY_UNAVAILABLE" })
}

function renderOnboarding(repository: HouseholdRepository = householdRepository) {
  return render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage repository={repository} />} />
        <Route path="/household" element={<h1>Đã lưu gia đình</h1>} />
      </Routes>
    </MemoryRouter>
  )
}

async function reachReview() {
  const user = userEvent.setup()
  const adults = screen.getByRole("spinbutton", { name: "Người lớn" })
  await user.clear(adults)
  await user.type(adults, "2")
  await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
  await user.type(screen.getByRole("textbox", { name: "Ngân sách tuần (VND)" }), "1500000")
  await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
  await user.click(screen.getByRole("checkbox", { name: "Dị ứng đậu phộng" }))
  await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
  await user.click(screen.getByRole("checkbox", { name: "Ưu tiên món canh" }))
  await user.click(screen.getByRole("radio", { name: "45 phút" }))
  await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
  return user
}

describe("OnboardingPage member and budget flow", () => {
  it("preserves the in-memory member draft when navigating back", async () => {
    const user = userEvent.setup()
    renderOnboarding()

    const adults = screen.getByRole("spinbutton", { name: "Người lớn" })
    await user.clear(adults)
    await user.type(adults, "2")
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
    expect(screen.getByRole("heading", { name: "Ngân sách cho 7 bữa chính" })).toBeInTheDocument()
    await user.type(screen.getByRole("textbox", { name: "Ngân sách tuần (VND)" }), "1500000")

    await user.click(screen.getByRole("button", { name: "Quay lại" }))

    expect(screen.getByRole("spinbutton", { name: "Người lớn" })).toHaveValue(2)
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
    expect(screen.getByRole("textbox", { name: "Ngân sách tuần (VND)" })).toHaveValue("1.500.000")
    expect(window.localStorage).toHaveLength(0)
  })

  it("shows five-step progress without persisting a partial budget", async () => {
    const user = userEvent.setup()
    renderOnboarding()
    expect(screen.getByRole("progressbar", { name: "Tiến độ thiết lập" })).toHaveAttribute(
      "aria-valuenow",
      "1"
    )

    const adults = screen.getByRole("spinbutton", { name: "Người lớn" })
    await user.clear(adults)
    await user.type(adults, "1")
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
    expect(screen.getByRole("progressbar", { name: "Tiến độ thiết lập" })).toHaveAttribute(
      "aria-valuenow",
      "2"
    )
  })

  it("saves all five steps atomically and navigates to the authoritative summary", async () => {
    const saveOwn = vi.fn<HouseholdRepository["saveOwn"]>(() =>
      Promise.resolve({
        ok: true,
        household: {
          householdId: "household-a",
          memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
          weeklyPlanBudgetVnd: 1_500_000,
          maxElapsedMinutes: 45,
          ruleCodes: ["allergen_peanut", "prefer_soup"],
          version: 1,
          onboardingCompletedAt: "2026-08-26T00:00:00Z"
        }
      })
    )
    renderOnboarding({ loadOwn: vi.fn(), saveOwn })
    const user = await reachReview()

    await user.click(screen.getByRole("button", { name: "Lưu thông tin" }))

    expect(saveOwn).toHaveBeenCalledWith(
      {
        memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
        weeklyPlanBudgetVnd: 1_500_000,
        maxElapsedMinutes: 45,
        ruleCodes: ["allergen_peanut", "prefer_soup"]
      },
      null
    )
    expect(await screen.findByRole("heading", { name: "Đã lưu gia đình" })).toBeInTheDocument()
  })

  it.each([
    ["STALE_HOUSEHOLD_VERSION", /thông tin đã thay đổi/i],
    ["UNAUTHORIZED", /phiên đăng nhập đã hết hạn/i],
    ["DEPENDENCY_UNAVAILABLE", /không thể lưu thông tin/i]
  ] as const)("shows the %s save outcome without losing the review", async (reason, message) => {
    const saveOwn = vi.fn<HouseholdRepository["saveOwn"]>(() =>
      Promise.resolve({ ok: false, reason })
    )
    renderOnboarding({ loadOwn: vi.fn(), saveOwn })
    const user = await reachReview()

    await user.click(screen.getByRole("button", { name: "Lưu thông tin" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(message)
    expect(screen.getByRole("heading", { name: "Kiểm tra thông tin" })).toBeInTheDocument()
  })
})
