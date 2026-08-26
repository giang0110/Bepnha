import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import {
  HouseholdRepositoryError,
  type HouseholdRepository
} from "@/application/household/household-repository"
import type { HouseholdSetup } from "@/domain/household/household"

import { HouseholdSummaryPage } from "./household-summary-page"

const household: HouseholdSetup = {
  householdId: "household-a",
  memberGroups: [
    { memberKind: "adult", ageBand: "adult", memberCount: 2 },
    { memberKind: "elderly", ageBand: "elderly", memberCount: 1 }
  ],
  weeklyPlanBudgetVnd: 1_200_000,
  maxElapsedMinutes: 30,
  ruleCodes: ["allergen_egg", "prefer_vegetable_forward"],
  version: 1,
  onboardingCompletedAt: "2026-08-26T00:00:00Z"
}

function repositoryWith(loadOwn: HouseholdRepository["loadOwn"]): HouseholdRepository {
  return { loadOwn, saveOwn: vi.fn() }
}

describe("HouseholdSummaryPage", () => {
  it("loads and renders the authoritative setup with an edit action", async () => {
    const repository = repositoryWith(vi.fn(() => Promise.resolve(household)))
    render(
      <MemoryRouter>
        <HouseholdSummaryPage repository={repository} />
      </MemoryRouter>
    )

    expect(screen.getByRole("status")).toHaveTextContent(/đang tải/i)
    expect(await screen.findByRole("heading", { name: "Gia đình của bạn" })).toBeInTheDocument()
    expect(screen.getByText("1.200.000 VND cho 7 bữa chính")).toBeInTheDocument()
    expect(screen.getByText("Dị ứng trứng")).toBeInTheDocument()
    expect(screen.getByText("Ưu tiên nhiều rau")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Chỉnh sửa thông tin" })).toHaveAttribute(
      "href",
      "/settings/household"
    )
  })

  it("allows retry after a retryable load failure", async () => {
    const user = userEvent.setup()
    const loadOwn = vi
      .fn<HouseholdRepository["loadOwn"]>()
      .mockRejectedValueOnce(new HouseholdRepositoryError("DEPENDENCY_UNAVAILABLE"))
      .mockResolvedValueOnce(household)
    render(
      <MemoryRouter>
        <HouseholdSummaryPage repository={repositoryWith(loadOwn)} />
      </MemoryRouter>
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(/không thể tải/i)
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByRole("heading", { name: "Gia đình của bạn" })).toBeInTheDocument()
    expect(loadOwn).toHaveBeenCalledTimes(2)
  })
})
