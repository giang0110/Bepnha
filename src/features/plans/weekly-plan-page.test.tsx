import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, test, vi } from "vitest"

import type { HouseholdRepository } from "@/application/household/household-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
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
    // A real meal is several dishes cooked alongside each other, each with its own ordered steps.
    // The single-step fixture this replaces could not express the order the page has to preserve.
    components: [
      {
        mealRole: "staple",
        sortOrder: 1,
        recipe: {
          recipeId: `com-${dayIndex}`,
          recipeVersionId: `com-version-${dayIndex}`,
          // The rice dish is the one written out in full: a known ingredient, an unknown one, and
          // the three conditions a step can carry.
          ingredients: [
            {
              recipeIngredientId: `com-gao-${dayIndex}`,
              foodId: "60000000-0000-0000-0000-000000000001"
            },
            { recipeIngredientId: `com-nuoc-${dayIndex}`, foodId: "food-unnamed" }
          ],
          steps: [
            {
              order: 1,
              instructionVi: "Vo gạo.",
              timerMinutes: null,
              heatLevel: null,
              temperatureCelsius: null,
              ingredientIds: [`com-gao-${dayIndex}`]
            },
            {
              order: 2,
              instructionVi: "Cho gạo và nước vào nồi.",
              timerMinutes: null,
              heatLevel: null,
              temperatureCelsius: null,
              ingredientIds: [`com-gao-${dayIndex}`, `com-nuoc-${dayIndex}`]
            },
            {
              order: 3,
              instructionVi: "Ủ cơm trước khi xới.",
              timerMinutes: 10,
              heatLevel: "low",
              temperatureCelsius: null,
              ingredientIds: []
            }
          ]
        }
      },
      {
        mealRole: "main",
        sortOrder: 2,
        recipe: {
          recipeId: `recipe-${dayIndex}`,
          recipeVersionId: `recipe-version-${dayIndex}`,
          ingredients: [],
          steps: [
            {
              order: 1,
              instructionVi: `Nấu bữa ${dayIndex + 1}.`,
              timerMinutes: 10,
              heatLevel: null,
              temperatureCelsius: null,
              ingredientIds: []
            },
            {
              order: 2,
              instructionVi: "Chiên vàng đều hai mặt.",
              timerMinutes: 6,
              heatLevel: "high",
              temperatureCelsius: 170,
              ingredientIds: []
            },
            {
              order: 3,
              instructionVi: "Vớt ra để ráo dầu.",
              timerMinutes: null,
              heatLevel: null,
              temperatureCelsius: null,
              ingredientIds: []
            }
          ]
        }
      },
      {
        mealRole: "vegetable",
        sortOrder: 3,
        recipe: {
          recipeId: `rau-${dayIndex}`,
          recipeVersionId: `rau-version-${dayIndex}`,
          ingredients: [],
          steps: [
            {
              order: 1,
              instructionVi: "Nhặt và rửa sạch rau.",
              timerMinutes: null,
              heatLevel: null,
              temperatureCelsius: null,
              ingredientIds: []
            },
            {
              order: 2,
              instructionVi: "Luộc rau với chút muối.",
              timerMinutes: null,
              heatLevel: null,
              temperatureCelsius: null,
              ingredientIds: []
            },
            {
              order: 3,
              instructionVi: "Vớt rau ra ngay.",
              timerMinutes: null,
              heatLevel: null,
              temperatureCelsius: null,
              ingredientIds: []
            }
          ]
        }
      }
    ],
    scaledIngredients: [
      {
        sourceId: `source-${dayIndex}`,
        foodId: "60000000-0000-0000-0000-000000000001",
        foodFactVersionId: `fact-${dayIndex}`,
        baseUnitId: "70010000-0000-0000-0000-000000000001",
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
  renderAssistant?: WeeklyPlanAssistantRenderer,
  foodOptionsOverrides: Partial<PantryFoodOptionsRepository> = {}
) {
  const api: PlannerApi = {
    generate: vi.fn().mockResolvedValue({ ok: true, value: ready() }),
    current: vi.fn().mockResolvedValue({ ok: true, value: null }),
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
  const foodOptionsRepository = {
    load: vi.fn().mockResolvedValue([
      {
        foodId: "60000000-0000-0000-0000-000000000001",
        foodNameVi: "Gạo tẻ",
        foodFactVersionId: "fact-0",
        baseUnitId: "70010000-0000-0000-0000-000000000001",
        units: [
          {
            unitId: "70010000-0000-0000-0000-000000000001",
            unitCode: "g",
            unitNameVi: "gam"
          }
        ]
      }
    ]),
    ...foodOptionsOverrides
  }
  render(
    <MemoryRouter>
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
        <WeeklyPlanPage
          foodOptionsRepository={foodOptionsRepository}
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
    // The button now waits on the week's plan lookup, so finding it is an await.
    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))

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
    expect(within(cards[0]!).getByText("Gạo tẻ — 400 g")).toBeInTheDocument()
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

  test("remounts assistant slot when the authoritative revision changes", async () => {
    const user = userEvent.setup()
    const renderAssistant: WeeklyPlanAssistantRenderer = ({ expectedRevisionId }) => (
      <input aria-label={`Assistant local state ${expectedRevisionId}`} defaultValue="" />
    )
    setup({}, renderAssistant)

    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    const oldState = await screen.findByRole("textbox", {
      name: `Assistant local state ${ready().revisionId}`
    })
    await user.type(oldState, "Lời khuyên cũ")
    expect(oldState).toHaveValue("Lời khuyên cũ")

    await user.click(screen.getAllByRole("button", { name: "Đổi bữa" })[2]!)
    await user.click(await screen.findByRole("button", { name: "Áp dụng bữa thay thế" }))

    const newState = await screen.findByRole("textbox", {
      name: "Assistant local state 50000000-0000-0000-0000-000000000002"
    })
    expect(newState).toHaveValue("")
    expect(newState).not.toBe(oldState)
  })

  test("renders typed empty/failure states and asks for reload on stale version", async () => {
    const user = userEvent.setup()
    setup({ generate: vi.fn().mockResolvedValue({ ok: false, error: "STALE_PLAN_VERSION" }) })
    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/thay đổi.*tải lại trang/i)
  })

  test("shows the week's existing plan on arrival, without being asked to generate one", async () => {
    // A reload used to lose the plan entirely: nothing read one back, so the page offered the only
    // thing it could, and persistence refused it because the week already had a plan.
    const { api } = setup({
      current: vi.fn().mockResolvedValue({ ok: true, value: ready() })
    })

    const cards = await screen.findAllByRole("listitem", { name: /^Bữa chính/u })
    expect(cards).toHaveLength(7)
    expect(api.current).toHaveBeenCalledWith("token", {
      householdId: household.householdId,
      weekStart: "2026-08-31"
    })
    expect(api.generate).not.toHaveBeenCalled()
  })

  test("regenerating names the version it replaces, so a week can be planned again", async () => {
    const user = userEvent.setup()
    const { api } = setup({
      current: vi.fn().mockResolvedValue({ ok: true, value: ready() })
    })

    await user.click(await screen.findByRole("button", { name: "Tạo lại kế hoạch tuần" }))

    expect(api.generate).toHaveBeenCalledWith("token", {
      householdId: household.householdId,
      weekStart: "2026-08-31",
      idempotencyKey: "30000000-0000-0000-0000-000000000001",
      expectedPlanVersion: ready().planVersion,
      expectedCurrentRevisionId: ready().revisionId
    })
  })

  test("keeps each dish's steps together, in the order they are cooked", async () => {
    // The replaced implementation re-sorted the flattened steps by their per-recipe order, so every
    // dish's first step came first, then every second step. Nine steps from three dishes read as one
    // impossible sequence: "cho gạo và nước vào nồi" landed between "ướp gia vị" and "chiên vàng".
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    const cards = await screen.findAllByRole("listitem", { name: /^Bữa chính/u })
    await user.click(within(cards[0]!).getByText("Xem cách nấu và dinh dưỡng"))

    const steps = within(cards[0]!)
      .getAllByRole("listitem")
      .map((node) => node.textContent)
      .filter((text): text is string => text !== null)

    const order = (needle: string) => steps.findIndex((text) => text.includes(needle))

    expect(order("Vo gạo.")).toBeLessThan(order("Cho gạo và nước vào nồi."))
    expect(order("Cho gạo và nước vào nồi.")).toBeLessThan(order("Ủ cơm trước khi xới."))
    // The whole staple finishes before the main dish starts, which is what grouping means.
    expect(order("Ủ cơm trước khi xới.")).toBeLessThan(order("Nấu bữa 1."))
    expect(order("Vớt ra để ráo dầu.")).toBeLessThan(order("Nhặt và rửa sạch rau."))
  })

  test("labels each dish, so an instruction says what it belongs to", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    const cards = await screen.findAllByRole("listitem", { name: /^Bữa chính/u })
    await user.click(within(cards[0]!).getByText("Xem cách nấu và dinh dưỡng"))

    expect(within(cards[0]!).getByRole("heading", { name: "Cơm" })).toBeInTheDocument()
    expect(within(cards[0]!).getByRole("heading", { name: "Món mặn" })).toBeInTheDocument()
    expect(within(cards[0]!).getByRole("heading", { name: "Rau" })).toBeInTheDocument()
  })

  test("says how long, how hot, and with what, for the steps that say so", async () => {
    // Reading "chiên vàng đều hai mặt" alone, a cook has to guess the heat and the minute to turn
    // it. The recipe knows both; the page used to drop them on the floor.
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    const cards = await screen.findAllByRole("listitem", { name: /^Bữa chính/u })
    await user.click(within(cards[0]!).getByText("Xem cách nấu và dinh dưỡng"))

    const frying = within(cards[0]!)
      .getAllByRole("listitem")
      .find((node) => node.textContent?.includes("Chiên vàng đều hai mặt."))

    expect(frying).toBeDefined()
    expect(frying!.textContent).toContain("6 phút")
    expect(frying!.textContent).toContain("Lửa lớn")
    expect(frying!.textContent).toContain("170°C")
  })

  test("names the ingredients a step reaches for, and says the id when it cannot", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    const cards = await screen.findAllByRole("listitem", { name: /^Bữa chính/u })
    await user.click(within(cards[0]!).getByText("Xem cách nấu và dinh dưỡng"))

    const pouring = within(cards[0]!)
      .getAllByRole("listitem")
      .find((node) => node.textContent?.includes("Cho gạo và nước vào nồi."))

    expect(pouring).toBeDefined()
    // A step link the food lookup cannot name is still shown: dropping it would say the step needs
    // one ingredient when it needs two.
    expect(pouring!.textContent).toContain("Nguyên liệu: Gạo tẻ, food-unnamed")
  })

  test("adds nothing to a step that states no time, heat, or ingredient", async () => {
    // Silence is the recipe's answer, not an invitation to fill in "lửa vừa".
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    const cards = await screen.findAllByRole("listitem", { name: /^Bữa chính/u })
    await user.click(within(cards[0]!).getByText("Xem cách nấu và dinh dưỡng"))

    const draining = within(cards[0]!)
      .getAllByRole("listitem")
      .find((node) => node.textContent?.includes("Vớt ra để ráo dầu."))

    expect(draining).toBeDefined()
    expect(draining!.textContent).toBe("Vớt ra để ráo dầu.")
  })

  test("falls back to the identifier and quantity when a name is not known", async () => {
    // Names are presentation only. A lookup that returns nothing, or fails outright, must leave the
    // plan readable rather than replacing the quantity with a label that says nothing.
    const user = userEvent.setup()
    setup({}, undefined, { load: vi.fn().mockRejectedValue(new Error("offline")) })

    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    const cards = await screen.findAllByRole("listitem", { name: /^Bữa chính/u })
    await user.click(within(cards[0]!).getByText("Xem cách nấu và dinh dưỡng"))

    expect(
      within(cards[0]!).getByText("60000000-0000-0000-0000-000000000001 — 400")
    ).toBeInTheDocument()
    expect(within(cards[0]!).queryByText(/đơn vị cơ sở/u)).not.toBeInTheDocument()
  })

  test("asks for a first plan, naming no version, when the week has none", async () => {
    const user = userEvent.setup()
    const { api } = setup()

    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))

    expect(api.generate).toHaveBeenCalledWith("token", {
      householdId: household.householdId,
      weekStart: "2026-08-31",
      idempotencyKey: "30000000-0000-0000-0000-000000000001"
    })
  })
})
