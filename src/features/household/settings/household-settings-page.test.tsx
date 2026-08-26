import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { describe, expect, it, vi } from "vitest"

import type { HouseholdRepository } from "@/application/household/household-repository"
import type { HouseholdSetup } from "@/domain/household/household"

import { HouseholdSummaryPage } from "../household-summary-page"
import { HouseholdSettingsPage } from "./household-settings-page"

const original: HouseholdSetup = {
  householdId: "household-a",
  memberGroups: [
    { memberKind: "adult", ageBand: "adult", memberCount: 2 },
    { memberKind: "child", ageBand: "7_9", memberCount: 1 }
  ],
  weeklyPlanBudgetVnd: 1_000_000,
  maxElapsedMinutes: 30,
  ruleCodes: ["exclude_beef", "prefer_soup"],
  version: 4,
  onboardingCompletedAt: "2026-08-26T00:00:00Z"
}

function renderSettings(repository: HouseholdRepository) {
  return render(
    <MemoryRouter initialEntries={["/settings/household"]}>
      <Routes>
        <Route
          path="/settings/household"
          element={<HouseholdSettingsPage repository={repository} />}
        />
        <Route path="/household" element={<HouseholdSummaryPage repository={repository} />} />
        <Route path="/onboarding" element={<h1>Thiết lập mới</h1>} />
      </Routes>
    </MemoryRouter>
  )
}

async function reachSettingsReview() {
  const user = userEvent.setup()
  await screen.findByRole("heading", { name: "Chỉnh sửa thành viên" })
  await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
  await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
  await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
  await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
  expect(screen.getByRole("heading", { name: "Kiểm tra thay đổi" })).toBeInTheDocument()
  return user
}

describe("HouseholdSettingsPage", () => {
  it("loads authoritative values into the shared household sections", async () => {
    const repository: HouseholdRepository = {
      loadOwn: vi.fn(() => Promise.resolve(original)),
      saveOwn: vi.fn()
    }
    renderSettings(repository)

    expect(screen.getByRole("status")).toHaveTextContent(/đang tải/i)
    expect(await screen.findByRole("heading", { name: "Chỉnh sửa thành viên" })).toBeInTheDocument()
    expect(screen.getByRole("spinbutton", { name: "Người lớn" })).toHaveValue(2)
    expect(screen.getByRole("spinbutton", { name: "Trẻ 7–9 tuổi" })).toHaveValue(1)
  })

  it("cancels without writing", async () => {
    const saveOwn = vi.fn<HouseholdRepository["saveOwn"]>()
    const repository: HouseholdRepository = {
      loadOwn: vi.fn(() => Promise.resolve(original)),
      saveOwn
    }
    renderSettings(repository)

    await userEvent.click(await screen.findByRole("button", { name: "Hủy chỉnh sửa" }))

    expect(saveOwn).not.toHaveBeenCalled()
    expect(await screen.findByRole("heading", { name: "Gia đình của bạn" })).toBeInTheDocument()
  })

  it("saves with the loaded version and reloads the authoritative summary", async () => {
    const updated: HouseholdSetup = {
      ...original,
      weeklyPlanBudgetVnd: 1_250_000,
      version: 5
    }
    const loadOwn = vi
      .fn<HouseholdRepository["loadOwn"]>()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(updated)
    const saveOwn = vi.fn<HouseholdRepository["saveOwn"]>(() =>
      Promise.resolve({ ok: true, household: updated })
    )
    renderSettings({ loadOwn, saveOwn })
    const user = userEvent.setup()
    await screen.findByRole("heading", { name: "Chỉnh sửa thành viên" })
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
    const budget = screen.getByRole("textbox", { name: "Ngân sách tuần (VND)" })
    await user.clear(budget)
    await user.type(budget, "1250000")
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }))
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }))

    expect(saveOwn).toHaveBeenCalledWith(
      expect.objectContaining({ weeklyPlanBudgetVnd: 1_250_000 }),
      4
    )
    expect(await screen.findByRole("heading", { name: "Gia đình của bạn" })).toBeInTheDocument()
    expect(screen.getByText("1.250.000 VND cho 7 bữa chính")).toBeInTheDocument()
    expect(loadOwn).toHaveBeenCalledTimes(2)
  })

  it("does not overwrite a stale version and reloads only after confirmation", async () => {
    const newer: HouseholdSetup = {
      ...original,
      memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 3 }],
      version: 5
    }
    const loadOwn = vi
      .fn<HouseholdRepository["loadOwn"]>()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(newer)
    const saveOwn = vi.fn<HouseholdRepository["saveOwn"]>(() =>
      Promise.resolve({ ok: false, reason: "STALE_HOUSEHOLD_VERSION" })
    )
    renderSettings({ loadOwn, saveOwn })
    const user = await reachSettingsReview()

    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/đã thay đổi/i)
    expect(loadOwn).toHaveBeenCalledOnce()

    await user.click(screen.getByRole("button", { name: "Tải lại thông tin mới nhất" }))
    expect(await screen.findByRole("spinbutton", { name: "Người lớn" })).toHaveValue(3)
    expect(loadOwn).toHaveBeenCalledTimes(2)
  })

  it("never turns a missing household into a second create path", async () => {
    const saveOwn = vi.fn<HouseholdRepository["saveOwn"]>()
    renderSettings({ loadOwn: vi.fn(() => Promise.resolve(null)), saveOwn })

    expect(
      await screen.findByRole("heading", { name: "Không có thông tin để chỉnh sửa" })
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Quay lại thiết lập" })).toHaveAttribute(
      "href",
      "/onboarding"
    )
    expect(saveOwn).not.toHaveBeenCalled()
  })
})
