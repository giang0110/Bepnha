import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, test, vi } from "vitest"

import type { HouseholdRepository } from "@/application/household/household-repository"
import { AuthContext } from "@/app/auth/auth-context"
import type { HouseholdSetup } from "@/domain/household/household"

import type { PlanItemView, PlannerApi, PlannerReadyResponse } from "./planner-api"
import { WeeklyPlanPage, type WeeklyPlanAssistantRenderer } from "./weekly-plan-page"

const household: HouseholdSetup = {
  householdId: "20000000-0000-0000-0000-000000000001",
  memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
  weeklyPlanBudgetVnd: 700_000,
  maxElapsedMinutes: 30,
  ruleCodes: [],
  version: 1,
  onboardingCompletedAt: "2026-08-26T00:00:00Z"
}

function item(dayIndex: number, name = `Bữa ${dayIndex + 1}`): PlanItemView {
  return {
    dayIndex,
    mealSlot: "primary",
    mealOptionId: `meal-${dayIndex}`,
    mealOptionVersionId: `meal-version-${dayIndex}`,
    adultEquivalent: "2",
    scaleFactor: "1",
    mealOptionCode: `meal_${dayIndex}`,
    mealOptionNameVi: name,
    elapsedMinutes: 25,
    components: [
      {
        mealRole: "main",
        sortOrder: 1,
        recipe: {
          recipeId: `recipe-${dayIndex}`,
          recipeVersionId: `recipe-version-${dayIndex}`,
          steps: [{ order: 1, instructionVi: `Nấu bữa ${dayIndex + 1}.`, timerMinutes: 10 }]
        }
      }
    ],
    scaledIngredients: [
      {
        sourceId: `source-${dayIndex}`,
        foodId: `food-${dayIndex}`,
        foodFactVersionId: `fact-${dayIndex}`,
        baseUnitId: "unit-g",
        baseQuantity: "400",
        grossGrams: "400"
      }
    ],
    nutrition: {
      nutrients: [{ nutrientCode: "energy_kcal", displayAmount: "520", unitCode: "kcal" }]
    }
  }
}

function ready(overrides: Partial<PlannerReadyResponse> = {}): PlannerReadyResponse {
  return {
    planId: "40000000-0000-0000-0000-000000000001",
    revisionId: "50000000-0000-0000-0000-000000000001",
    planVersion: 1,
    idempotent: false,
    status: "ready_within_budget",
    budgetVnd: 700_000,
    plan: {
      items: Array.from({ length: 7 }, (_, index) => item(index)),
      totalEstimatedCostVnd: 650_000
    },
    warnings: [],
    ...overrides
  }
}

function setup(
  apiOverrides: Partial<PlannerApi> = {},
  renderAssistant?: WeeklyPlanAssistantRenderer
) {
  const api: PlannerApi = {
    generate: vi.fn().mockResolvedValue({ ok: true, value: ready() }),
    preview: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        status: "ready_within_budget",
        items: Array.from({ length: 7 }, (_, index) =>
          index === 2 ? item(index, "Bữa thay thế") : item(index)
        ),
        weeklyEstimatedCostVnd: 660_000,
        costDeltaVnd: 10_000,
        warnings: [],
        previewFingerprint: "d".repeat(64)
      }
    }),
    apply: vi.fn().mockResolvedValue({
      ok: true,
      value: ready({
        revisionId: "50000000-0000-0000-0000-000000000002",
        planVersion: 2,
        costDeltaVnd: 10_000,
        plan: {
          items: Array.from({ length: 7 }, (_, index) =>
            index === 2 ? item(index, "Bữa thay thế") : item(index)
          ),
          totalEstimatedCostVnd: 660_000
        }
      })
    }),
    ...apiOverrides
  }
  const repository: HouseholdRepository = {
    loadOwn: vi.fn().mockResolvedValue(household),
    saveOwn: vi.fn()
  }
  render(
    <MemoryRouter>
      <AuthContext.Provider
        value={{
          status: "authenticated",
          session: { accessToken: "token", identity: { userId: "user", email: null } },
          signIn: vi.fn(),
          signOut: vi.fn(),
          signUp: vi.fn()
        }}
      >
        <WeeklyPlanPage
          householdRepository={repository}
          plannerApi={api}
          {...(renderAssistant === undefined ? {} : { renderAssistant })}
          today={() => new Date("2026-08-27T00:00:00+07:00")}
          createId={() => "30000000-0000-0000-0000-000000000001"}
        />
      </AuthContext.Provider>
    </MemoryRouter>
  )
  return { api, repository }
}

describe("WeeklyPlanPage", () => {
  test("generates and renders seven ordered primary meals with immutable details", async () => {
    const user = userEvent.setup()
    const { api } = setup()
    expect(await screen.findByRole("heading", { name: "Kế hoạch tuần" })).toBeInTheDocument()
    expect(screen.getByText(/ngân sách chỉ áp dụng cho 7 bữa chính/i)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))

    const cards = await screen.findAllByRole("listitem", { name: /^Bữa chính/u })
    expect(cards).toHaveLength(7)
    expect(within(cards[0]!).getByRole("heading", { name: "Thứ Hai" })).toBeInTheDocument()
    expect(within(cards[6]!).getByRole("heading", { name: "Chủ Nhật" })).toBeInTheDocument()
    expect(screen.getByText("650.000 VND / 700.000 VND")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Đi chợ" })).toHaveAttribute(
      "href",
      `/shopping/${ready().planId}`
    )
    expect(api.generate).toHaveBeenCalledWith("token", {
      householdId: household.householdId,
      weekStart: "2026-08-31",
      idempotencyKey: "30000000-0000-0000-0000-000000000001"
    })

    await user.click(within(cards[0]!).getByText("Xem cách nấu và dinh dưỡng"))
    expect(within(cards[0]!).getByText("400 g")).toBeInTheDocument()
    expect(within(cards[0]!).getByText("Nấu bữa 1.")).toBeInTheDocument()
    expect(within(cards[0]!).getByText("520 kcal")).toBeInTheDocument()
    expect(screen.queryByText(/danh sách mua sắm/i)).not.toBeInTheDocument()
  })

  test("shows precise over-budget, bounded-search, and stale-price warnings as successful output", async () => {
    const user = userEvent.setup()
    setup({
      generate: vi.fn().mockResolvedValue({
        ok: true,
        value: ready({
          status: "ready_over_budget",
          plan: {
            items: Array.from({ length: 7 }, (_, index) => item(index)),
            totalEstimatedCostVnd: 725_000
          },
          warnings: [
            {
              code: "PLAN_OVER_BUDGET",
              budgetVnd: 700_000,
              estimatedPlanCostVnd: 725_000,
              overageVnd: 25_000
            },
            { code: "NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH" },
            { code: "STALE_PRICE" }
          ]
        })
      })
    })
    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    expect(await screen.findByText(/vượt ngân sách 25.000 VND/i)).toBeInTheDocument()
    expect(
      screen.getByText(/không tìm thấy kế hoạch dưới ngân sách trong phạm vi tìm kiếm tất định/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/giá cũ nhưng vẫn còn dùng được/i)).toBeInTheDocument()
  })

  test("previews, cancels without writing, then applies exactly the server replacement", async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    const before = (await screen.findAllByTestId("meal-name")).map((node) => node.textContent)
    await user.click(screen.getAllByRole("button", { name: "Đổi bữa" })[2]!)
    expect(await screen.findByText("Bữa thay thế")).toBeInTheDocument()
    expect(screen.getByText(/tăng 10.000 VND/i)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Hủy thay đổi" }))
    expect(api.apply).not.toHaveBeenCalled()

    await user.click(screen.getAllByRole("button", { name: "Đổi bữa" })[2]!)
    await user.click(await screen.findByRole("button", { name: "Áp dụng bữa thay thế" }))
    const after = (await screen.findAllByTestId("meal-name")).map((node) => node.textContent)
    expect(after.filter((name, index) => name !== before[index])).toEqual(["Bữa thay thế"])
    expect(api.apply).toHaveBeenCalledOnce()
  })

  test("assistant slot can only start deterministic preview and never applies directly", async () => {
    const user = userEvent.setup()
    const renderAssistant: WeeklyPlanAssistantRenderer = ({ onPreviewDay }) => (
      <section aria-label="Trợ lý Bếp Nhà">
        <button type="button" onClick={() => onPreviewDay(2)}>
          Xem bữa thay thế cho Thứ Tư
        </button>
      </section>
    )
    const { api } = setup({}, renderAssistant)

    expect(screen.queryByRole("region", { name: "Trợ lý Bếp Nhà" })).not.toBeInTheDocument()
    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))

    expect(await screen.findByRole("region", { name: "Trợ lý Bếp Nhà" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Xem bữa thay thế cho Thứ Tư" }))

    expect(api.preview).toHaveBeenCalledOnce()
    expect(api.preview).toHaveBeenCalledWith("token", {
      planId: ready().planId,
      targetDayIndex: 2,
      expectedPlanVersion: 1
    })
    expect(api.apply).not.toHaveBeenCalled()
    expect(await screen.findByRole("button", { name: "Áp dụng bữa thay thế" })).toBeInTheDocument()
  })

  test("renders typed empty/failure states and asks for reload on stale version", async () => {
    const user = userEvent.setup()
    setup({ generate: vi.fn().mockResolvedValue({ ok: false, error: "STALE_PLAN_VERSION" }) })
    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/đã thay đổi.*tải lại/i)
  })
})
