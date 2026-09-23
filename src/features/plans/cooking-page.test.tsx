import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { describe, expect, test, vi } from "vitest"

import type { HouseholdRepository } from "@/application/household/household-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
import { AuthContext } from "@/app/auth/auth-context"
import type { HouseholdSetup } from "@/domain/household/household"

import { CookingPage } from "./cooking-page"
import type { PlanItemView, PlannerApi, PlannerReadyResponse } from "./planner-api"

const GAM = "70010000-0000-0000-0000-000000000001"
const GAO = "60000000-0000-0000-0000-000000000001"

const household: HouseholdSetup = {
  householdId: "20000000-0000-0000-0000-000000000001",
  memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
  weeklyPlanBudgetVnd: 700_000,
  maxElapsedMinutes: 30,
  ruleCodes: [],
  version: 1,
  onboardingCompletedAt: "2026-08-26T00:00:00Z"
}

function item(dayIndex: number): PlanItemView {
  return {
    dayIndex,
    mealSlot: "primary",
    mealOptionId: `meal-${dayIndex}`,
    mealOptionVersionId: `meal-version-${dayIndex}`,
    adultEquivalent: "2",
    scaleFactor: "1",
    mealOptionCode: `meal_${dayIndex}`,
    mealOptionNameVi: `Cơm gà bữa ${dayIndex + 1}`,
    elapsedMinutes: 25,
    components: [
      {
        mealRole: "main",
        sortOrder: 2,
        recipe: {
          recipeId: "ga",
          recipeVersionId: "ga-v1",
          ingredients: [{ recipeIngredientId: "ri-gao", foodId: GAO }],
          steps: [
            {
              order: 1,
              instructionVi: "Ướp gà với gia vị.",
              timerMinutes: 15,
              heatLevel: null,
              temperatureCelsius: null,
              ingredientIds: ["ri-gao"]
            },
            {
              order: 2,
              instructionVi: "Chiên vàng đều hai mặt.",
              timerMinutes: 6,
              heatLevel: "high",
              temperatureCelsius: 170,
              ingredientIds: []
            }
          ]
        }
      },
      {
        mealRole: "staple",
        sortOrder: 1,
        recipe: {
          recipeId: "com",
          recipeVersionId: "com-v1",
          ingredients: [],
          steps: [
            {
              order: 1,
              instructionVi: "Vo gạo.",
              timerMinutes: null,
              heatLevel: null,
              temperatureCelsius: null,
              ingredientIds: []
            }
          ]
        }
      }
    ],
    scaledIngredients: [],
    nutrition: { nutrients: [] }
  }
}

function ready(): PlannerReadyResponse {
  return {
    planId: "40000000-0000-0000-0000-000000000001",
    revisionId: "50000000-0000-0000-0000-000000000001",
    planVersion: 1,
    idempotent: false,
    status: "ready_within_budget",
    budgetVnd: 700_000,
    plan: { items: [item(0), item(1)], totalEstimatedCostVnd: 650_000 },
    warnings: []
  }
}

function setup(apiOverrides: Partial<PlannerApi> = {}, dayIndex = "1") {
  const api: PlannerApi = {
    generate: vi.fn(),
    current: vi.fn().mockResolvedValue({ ok: true, value: ready() }),
    preview: vi.fn(),
    apply: vi.fn(),
    ...apiOverrides
  }
  const householdRepository: HouseholdRepository = {
    loadOwn: vi.fn().mockResolvedValue(household),
    saveOwn: vi.fn()
  }
  const foodOptionsRepository: PantryFoodOptionsRepository = {
    load: vi.fn().mockResolvedValue([
      {
        foodId: GAO,
        foodNameVi: "Gạo tẻ",
        foodFactVersionId: "fact-0",
        baseUnitId: GAM,
        units: [{ unitId: GAM, unitCode: "g", unitNameVi: "gam" }]
      }
    ])
  }

  render(
    <MemoryRouter initialEntries={[`/plan/${dayIndex}/cook`]}>
      <AuthContext.Provider
        value={{
          passwordRecoveryReady: false,
          status: "authenticated",
          session: { accessToken: "token", identity: { userId: "user", email: null } },
          signIn: vi.fn(),
          signOut: vi.fn(),
          signUp: vi.fn(),
          requestPasswordReset: vi.fn(),
          updatePassword: vi.fn()
        }}
      >
        <Routes>
          <Route
            path="/plan/:dayIndex/cook"
            element={
              <CookingPage
                foodOptionsRepository={foodOptionsRepository}
                householdRepository={householdRepository}
                plannerApi={api}
                today={() => new Date("2026-08-27T00:00:00+07:00")}
              />
            }
          />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  )
  return { api }
}

describe("CookingPage", () => {
  test("opens on the first step of the day it was asked for, not the first day of the week", async () => {
    const { api } = setup()

    expect(await screen.findByText("Vo gạo.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Cơm gà bữa 2" })).toBeInTheDocument()
    expect(screen.getByText("Thứ Ba")).toBeInTheDocument()
    expect(api.current).toHaveBeenCalledWith("token", {
      householdId: household.householdId,
      weekStart: "2026-08-31"
    })
  })

  test("moves through the dishes one step at a time, each dish finished before the next starts", async () => {
    const user = userEvent.setup()
    setup()

    expect(await screen.findByText("Vo gạo.")).toBeInTheDocument()
    // The rice is dish 1 by sortOrder even though the chicken is listed first in the plan.
    expect(screen.getByText(/Món 1\/2/u)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bước trước" })).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))
    expect(screen.getByText("Ướp gà với gia vị.")).toBeInTheDocument()
    expect(screen.getByText(/Món 2\/2/u)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))
    expect(screen.getByText("Chiên vàng đều hai mặt.")).toBeInTheDocument()
    // The last step offers the way out rather than a fourth step that does not exist.
    expect(screen.queryByRole("button", { name: "Bước tiếp" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Nấu xong" })).toHaveAttribute("href", "/plan")
  })

  test("shows the conditions and the named ingredients the step carries", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Bước tiếp" }))
    expect(screen.getByText("Gạo tẻ")).toBeInTheDocument()
    expect(screen.getByText("15 phút")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))
    expect(screen.getByText("Lửa lớn")).toBeInTheDocument()
    expect(screen.getByText("170°C")).toBeInTheDocument()
  })

  test("offers a countdown only on a step that has one, and starts it at the full time", async () => {
    const user = userEvent.setup()
    setup()

    expect(await screen.findByText("Vo gạo.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Bắt đầu" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))
    expect(screen.getByText("15:00")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bắt đầu" })).toBeInTheDocument()
    // Reset is offered only once there is something to reset; an inert control beside a live one
    // is noise on a screen meant to be read at arm's length.
    expect(screen.queryByRole("button", { name: "Đặt lại" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Bắt đầu" }))
    expect(screen.getByRole("button", { name: "Tạm dừng" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Đặt lại" })).toBeInTheDocument()
  })

  test("gives the next step a fresh timer rather than carrying a running one across", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Bước tiếp" }))
    await user.click(screen.getByRole("button", { name: "Bắt đầu" }))
    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))

    // A countdown that kept running would be timing the marinade while the cook is frying.
    expect(screen.getByText("6:00")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bắt đầu" })).toBeInTheDocument()
  })

  test("says the meal is missing rather than showing an empty screen", async () => {
    setup({}, "5")

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Chưa có bữa này trong kế hoạch tuần"
    )
  })

  test("reports a refused read instead of looking like a meal with no steps", async () => {
    setup({ current: vi.fn().mockResolvedValue({ ok: false, error: { code: "UNAUTHORIZED" } }) })

    expect(await screen.findByRole("alert")).toHaveTextContent("Không mở được kế hoạch")
  })
})
