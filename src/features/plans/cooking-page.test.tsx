import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, test, vi } from "vitest"

import type { MealRatingRepository } from "@/application/meal-rating/meal-rating-repository"
import type { HouseholdRepository } from "@/application/household/household-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
import type { PantryRepository } from "@/application/pantry/pantry-repository"
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
        mealOptionRecipeId: "meal-recipe-main",
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
        mealOptionRecipeId: "meal-recipe-staple",
        mealRole: "staple",
        sortOrder: 1,
        recipe: {
          recipeId: "com",
          recipeVersionId: "com-v1",
          ingredients: [{ recipeIngredientId: "ri-gao-com", foodId: GAO }],
          steps: [
            {
              order: 1,
              instructionVi: "Vo gạo.",
              timerMinutes: null,
              heatLevel: null,
              temperatureCelsius: null,
              ingredientIds: ["ri-gao-com"]
            }
          ]
        }
      }
    ],
    scaledIngredients: [
      {
        sourceId: "meal-recipe-main:ri-gao",
        foodId: GAO,
        foodFactVersionId: "fact-0",
        baseUnitId: GAM,
        baseQuantity: "400",
        grossGrams: "400"
      },
      {
        sourceId: "meal-recipe-staple:ri-gao-com",
        foodId: GAO,
        foodFactVersionId: "fact-0",
        baseUnitId: GAM,
        baseQuantity: "400",
        grossGrams: "400"
      }
    ],
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

function setup(
  apiOverrides: Partial<PlannerApi> = {},
  dayIndex = "1",
  mealRatingRepository?: MealRatingRepository,
  skipRice: boolean | null = false,
  pantryRepository?: PantryRepository
) {
  if (skipRice !== null) {
    window.localStorage.setItem("bepnha:cooking:skip-rice", String(skipRice))
  }
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
        units: [{ unitId: GAM, unitCode: "g", unitNameVi: "gam", baseQuantityPerUnit: "1" }]
      }
    ])
  }

  const rendered = render(
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
                {...(mealRatingRepository === undefined ? {} : { mealRatingRepository })}
                {...(pantryRepository === undefined ? {} : { pantryRepository })}
                today={() => new Date("2026-08-27T00:00:00+07:00")}
              />
            }
          />
          <Route path="/plan" element={<div data-testid="plan-screen">Kế hoạch tuần</div>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  )
  return { api, unmount: rendered.unmount }
}

describe("CookingPage", () => {
  beforeEach(() => window.localStorage.clear())

  test("opens on the first step of the day it was asked for, not the first day of the week", async () => {
    const { api } = setup()

    expect(await screen.findByText("Vo gạo.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Cơm gà bữa 2" })).toBeInTheDocument()
    expect(screen.getByText("Thứ Ba")).toBeInTheDocument()
    expect(api.current).toHaveBeenCalledWith("token", {
      householdId: household.householdId,
      weekStart: "2026-08-24"
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
    expect(screen.getByRole("button", { name: "Nấu xong" })).toBeInTheDocument()
  })

  test("shows the conditions and the named ingredients the step carries", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Bước tiếp" }))
    expect(screen.getByText("Gạo tẻ — 400 g")).toBeInTheDocument()
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

  test("restores the exact step and running timer after a reload of the same revision", async () => {
    const user = userEvent.setup()
    const first = setup()

    await user.click(await screen.findByRole("button", { name: "Bước tiếp" }))
    await user.click(screen.getByRole("button", { name: "Bắt đầu" }))
    expect(screen.getByRole("button", { name: "Tạm dừng" })).toBeInTheDocument()
    first.unmount()

    setup()
    expect(await screen.findByText("Ướp gà với gia vị.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Tạm dừng" })).toBeInTheDocument()
  })

  test("does not restore progress from a previous immutable revision", async () => {
    window.localStorage.setItem(
      "bepnha:cooking-progress:v1",
      JSON.stringify({
        version: "cooking-progress-v1",
        revisionId: "old-revision",
        dayIndex: 1,
        stepKey: "1:1",
        timers: {}
      })
    )

    setup()
    expect(await screen.findByText("Vo gạo.")).toBeInTheDocument()
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

  test("asks what the household thought once the last step is done", async () => {
    const user = userEvent.setup()
    const set = vi.fn(() => Promise.resolve())
    setup({}, "1", { load: vi.fn(() => Promise.resolve({ liked: [], disliked: [] })), set })

    // The plan loads asynchronously, so wait for the first step before walking to the end.
    await screen.findByRole("button", { name: "Bước tiếp" })
    // The question has no place earlier: an opinion about a dish is formed by cooking it, and
    // asking at step two is asking about nothing.
    expect(screen.queryByRole("button", { name: "Thích món này" })).not.toBeInTheDocument()
    let next = screen.queryByRole("button", { name: "Bước tiếp" })
    while (next !== null) {
      await user.click(next)
      next = screen.queryByRole("button", { name: "Bước tiếp" })
    }

    await user.click(await screen.findByRole("button", { name: "Thích món này" }))
    expect(set).toHaveBeenCalledWith(household.householdId, "meal-1", "liked")
  })

  test("still lets the cook leave without answering", async () => {
    const user = userEvent.setup()
    setup({}, "1", {
      load: vi.fn(() => Promise.resolve({ liked: [], disliked: [] })),
      set: vi.fn(() => Promise.resolve())
    })

    await screen.findByRole("button", { name: "Bước tiếp" })
    let next = screen.queryByRole("button", { name: "Bước tiếp" })
    while (next !== null) {
      await user.click(next)
      next = screen.queryByRole("button", { name: "Bước tiếp" })
    }

    // The question is an offer, not a toll. Someone carrying a hot pan should be able to walk away.
    expect(await screen.findByRole("button", { name: "Nấu xong" })).toBeInTheDocument()
  })

  test("toggles counter stand mode to enlarge view and navigation buttons", async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByText("Vo gạo.")
    const counterToggle = screen.getByRole("button", { name: "Kệ bếp" })
    expect(counterToggle).toBeInTheDocument()

    await user.click(counterToggle)
    expect(screen.getByRole("button", { name: "Chế độ kệ bếp: Bật" })).toBeInTheDocument()
    const nextBtn = screen.getByRole("button", { name: "Bước tiếp" })
    expect(nextBtn.className).toContain("min-h-16")

    await user.click(screen.getByRole("button", { name: "Chế độ kệ bếp: Bật" }))
    expect(screen.getByRole("button", { name: "Kệ bếp" })).toBeInTheDocument()
    expect(nextBtn.className).not.toContain("min-h-16")
  })

  test("manages family cooking notes saved in localStorage", async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByText("Vo gạo.")
    expect(screen.getByText("Mẹo & Ghi chú của gia đình")).toBeInTheDocument()
    const addNoteBtn = screen.getByRole("button", { name: "+ Thêm ghi chú" })

    await user.click(addNoteBtn)
    const textarea = screen.getByPlaceholderText(/Giảm 1 thìa đường/i)
    await user.type(textarea, "Nấu cơm ráo nước, cho thêm chút dầu mè")

    const saveBtn = screen.getByRole("button", { name: "Lưu ghi chú" })
    await user.click(saveBtn)

    expect(screen.getByText("Nấu cơm ráo nước, cho thêm chút dầu mè")).toBeInTheDocument()
    expect(window.localStorage.getItem("bepnha:cooking-note:v1:meal-1")).toBe(
      "Nấu cơm ráo nước, cho thêm chút dầu mè"
    )
    expect(screen.getByRole("button", { name: "Sửa ghi chú" })).toBeInTheDocument()
  })

  test("speaks cooking instruction and cancels on step navigation", async () => {
    const mockSpeak = vi.fn()
    const mockCancel = vi.fn()
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak: mockSpeak,
        cancel: mockCancel,
        speaking: false
      },
      writable: true,
      configurable: true
    })
    ;(window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      text: string
      lang = ""
      rate = 1
      constructor(text = "") {
        this.text = text
      }
    }

    const user = userEvent.setup()
    setup()

    await screen.findByText("Vo gạo.")
    const speakBtn = screen.getByRole("button", { name: "Đọc bước" })
    await user.click(speakBtn)

    expect(mockSpeak).toHaveBeenCalledTimes(1)

    // Moving to next step should cancel speech
    const nextBtn = screen.getByRole("button", { name: "Bước tiếp" })
    await user.click(nextBtn)
    expect(mockCancel).toHaveBeenCalled()
  })

  test("navigates steps using ArrowRight and ArrowLeft keyboard shortcuts", async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByText("Vo gạo.")
    expect(screen.getByText(/Món 1\/2/u)).toBeInTheDocument()

    // Press ArrowRight to go to next step
    await user.keyboard("{ArrowRight}")
    expect(await screen.findByText("Ướp gà với gia vị.")).toBeInTheDocument()

    // Press ArrowLeft to go back
    await user.keyboard("{ArrowLeft}")
    expect(await screen.findByText("Vo gạo.")).toBeInTheDocument()
  })

  test("defaults to skipping rice with estimate banner and toggles preference in localStorage", async () => {
    const user = userEvent.setup()
    // pass null to simulate default unconfigured state (no prior localStorage)
    setup({}, "1", undefined, null)

    // Unconfigured state: skips rice by default, starts on main dish
    expect(await screen.findByText("Ướp gà với gia vị.")).toBeInTheDocument()
    expect(screen.queryByText("Vo gạo.")).not.toBeInTheDocument()
    expect(screen.getByText(/Nồi cơm điện:/i)).toBeInTheDocument()
    expect(screen.getByText(/Nhớ cắm nồi:/i)).toBeInTheDocument()
    expect(screen.getByText(/Gạo tẻ — 400 g \(~2,5 bát\/cốc đong\)/i)).toBeInTheDocument()

    // Clicking "Hiện lại bước nấu cơm" reveals rice step
    const showRiceBtn = screen.getByRole("button", { name: "Hiện lại bước nấu cơm" })
    await user.click(showRiceBtn)
    expect(await screen.findByText("Vo gạo.")).toBeInTheDocument()
    expect(window.localStorage.getItem("bepnha:cooking:skip-rice")).toBe("false")

    // Clicking "Bỏ qua bước nấu cơm" hides it again and remembers in localStorage
    const skipRiceBtn = screen.getByRole("button", { name: "Bỏ qua bước nấu cơm" })
    await user.click(skipRiceBtn)
    expect(screen.queryByText("Vo gạo.")).not.toBeInTheDocument()
    expect(screen.getByText("Ướp gà với gia vị.")).toBeInTheDocument()
    expect(window.localStorage.getItem("bepnha:cooking:skip-rice")).toBe("true")
  })

  test("shows background timer banner when navigating away from a running timer and jumps back", async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByText("Vo gạo.")
    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))

    // Now on step 2: "Ướp gà với gia vị." (15 mins timer)
    expect(await screen.findByText("Ướp gà với gia vị.")).toBeInTheDocument()
    const startTimerBtn = screen.getByRole("button", { name: "Bắt đầu" })
    await user.click(startTimerBtn)

    // Navigate to step 3: "Chiên vàng đều hai mặt."
    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))
    expect(await screen.findByText("Chiên vàng đều hai mặt.")).toBeInTheDocument()

    // Background timer banner for step 2 should be visible
    expect(
      screen.getByRole("status", { name: /Đang đếm giờ: Món mặn bước 1/i })
    ).toBeInTheDocument()

    // Clicking "Xem bước" in the background timer jumps back to step 2
    const jumpBtn = screen.getByRole("button", { name: "Xem bước" })
    await user.click(jumpBtn)
    expect(await screen.findByText("Ướp gà với gia vị.")).toBeInTheDocument()
  })

  test("opens pre-prep modal, allows checking ingredients, and closes", async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByText("Vo gạo.")
    const prepBtn = screen.getByRole("button", { name: "Sơ chế" })
    await user.click(prepBtn)

    // Modal dialog is open
    expect(
      screen.getByRole("dialog", { name: "Khâu sơ chế & Chuẩn bị nguyên liệu" })
    ).toBeInTheDocument()
    expect(screen.getByText("Sơ chế & Chuẩn bị nguyên liệu")).toBeInTheDocument()
    expect(screen.getByText(/Đã sơ chế 0\/2/i)).toBeInTheDocument()

    // Toggle ingredient checkbox
    const [firstCheckbox] = screen.getAllByRole("checkbox")
    expect(firstCheckbox).toBeDefined()
    if (!firstCheckbox) throw new Error("Expected at least one ingredient checkbox")
    expect(firstCheckbox).not.toBeChecked()
    await user.click(firstCheckbox)
    expect(firstCheckbox).toBeChecked()
    expect(screen.getByText(/Đã sơ chế 1\/2/i)).toBeInTheDocument()

    // Close modal
    const closeBtn = screen.getByRole("button", { name: "Đã sẵn sàng nấu" })
    await user.click(closeBtn)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  test("shows pantry deduction modal on 'Nấu xong' when ingredients match pantry, and updates inventory on confirm", async () => {
    const user = userEvent.setup()
    const load = vi.fn().mockResolvedValue([
      {
        pantryItemId: "pantry-gao",
        householdId: household.householdId,
        foodId: GAO,
        foodFactVersionId: "fact-0",
        quantity: "1000",
        unitId: GAM,
        baseQuantity: "1000",
        baseUnitId: GAM,
        version: 1,
        updatedAt: "2026-08-26T00:00:00Z"
      }
    ])
    const upsert = vi.fn().mockResolvedValue({
      pantryItemId: "pantry-gao",
      householdId: household.householdId,
      foodId: GAO,
      foodFactVersionId: "fact-0",
      quantity: "200",
      unitId: GAM,
      baseQuantity: "200",
      baseUnitId: GAM,
      version: 2,
      updatedAt: "2026-08-27T00:00:00Z"
    })
    const remove = vi.fn()
    const pantryRepository: PantryRepository = { load, upsert, remove }

    setup({}, "1", undefined, false, pantryRepository)

    // Navigate to the last step
    expect(await screen.findByText("Vo gạo.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))
    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))

    const finishButton = screen.getByRole("button", { name: "Nấu xong" })
    await user.click(finishButton)

    // Modal should appear with matched pantry item (Gạo tẻ: 1000g available, 800g used -> 200g remaining)
    expect(await screen.findByRole("dialog", { name: /Xác nhận trừ kho/ })).toBeInTheDocument()
    expect(screen.getByText("Gạo tẻ")).toBeInTheDocument()
    expect(screen.getByText(/Còn 200 gam/)).toBeInTheDocument()

    // Confirm deduction
    const confirmButton = screen.getByRole("button", { name: /Xác nhận trừ kho/ })
    await user.click(confirmButton)

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: household.householdId,
        foodId: GAO,
        quantity: "200",
        expectedVersion: 1
      })
    )
    expect(await screen.findByTestId("plan-screen")).toBeInTheDocument()
  })

  test("skips pantry deduction when cook clicks skip in deduction modal", async () => {
    const user = userEvent.setup()
    const load = vi.fn().mockResolvedValue([
      {
        pantryItemId: "pantry-gao",
        householdId: household.householdId,
        foodId: GAO,
        foodFactVersionId: "fact-0",
        quantity: "1000",
        unitId: GAM,
        baseQuantity: "1000",
        baseUnitId: GAM,
        version: 1,
        updatedAt: "2026-08-26T00:00:00Z"
      }
    ])
    const upsert = vi.fn()
    const remove = vi.fn()
    const pantryRepository: PantryRepository = { load, upsert, remove }

    setup({}, "1", undefined, false, pantryRepository)

    expect(await screen.findByText("Vo gạo.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))
    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))

    const finishButton = screen.getByRole("button", { name: "Nấu xong" })
    await user.click(finishButton)

    expect(await screen.findByRole("dialog", { name: /Xác nhận trừ kho/ })).toBeInTheDocument()

    // Click skip
    const skipButton = screen.getByRole("button", { name: "Bỏ qua (về kế hoạch)" })
    await user.click(skipButton)

    expect(upsert).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(await screen.findByTestId("plan-screen")).toBeInTheDocument()
  })

  test("manages kitchen timer sound toggle and sound test button", async () => {
    const user = userEvent.setup()
    setup()

    expect(await screen.findByText("Vo gạo.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))
    expect(screen.getByText("15:00")).toBeInTheDocument()

    const testSoundBtn = screen.getByTestId("test-timer-sound-btn")
    expect(testSoundBtn).toBeInTheDocument()
    await user.click(testSoundBtn)

    const toggleSoundBtn = screen.getByTestId("toggle-timer-sound-btn")
    expect(toggleSoundBtn).toHaveTextContent("Chuông: Bật")
    await user.click(toggleSoundBtn)
    expect(toggleSoundBtn).toHaveTextContent("Chuông: Tắt")
    await user.click(toggleSoundBtn)
    expect(toggleSoundBtn).toHaveTextContent("Chuông: Bật")
  })

  test("shows dismiss alarm button when timer finishes and dismisses on click", async () => {
    const user = userEvent.setup()

    window.localStorage.setItem(
      "bepnha:cooking-progress:v1",
      JSON.stringify({
        version: "cooking-progress-v1",
        revisionId: "50000000-0000-0000-0000-000000000001",
        dayIndex: 1,
        stepKey: "1:1",
        timers: {
          "1:1": {
            startedAt: Date.now() - 1000 * 1000,
            pausedWith: null
          }
        }
      })
    )

    setup()

    expect(await screen.findByText("0:00")).toBeInTheDocument()
    expect(screen.getByText(/Hết giờ/i)).toBeInTheDocument()

    const dismissBtn = await screen.findByTestId("dismiss-alarm-btn")
    expect(dismissBtn).toBeInTheDocument()
    expect(dismissBtn).toHaveTextContent("Dừng chuông")

    await user.click(dismissBtn)
    expect(screen.queryByTestId("dismiss-alarm-btn")).not.toBeInTheDocument()
  })

  test("opens condiment pairing modal, displays sauce recipes, and closes", async () => {
    const user = userEvent.setup()
    setup()

    expect(await screen.findByText("Cơm gà bữa 2")).toBeInTheDocument()

    const condimentBtn = screen.getByRole("button", { name: /Nước chấm/i })
    expect(condimentBtn).toBeInTheDocument()

    await user.click(condimentBtn)

    expect(screen.getByText(/Gợi ý nước chấm & ăn kèm chuẩn vị/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Nước chấm & Ăn kèm chuẩn vị/i).length).toBeGreaterThanOrEqual(1)

    const closeBtn = screen.getByRole("button", { name: "Đã xong, quay lại nấu" })
    await user.click(closeBtn)

    expect(screen.queryByText(/Nước chấm & Ăn kèm chuẩn vị/i)).not.toBeInTheDocument()
  })

  test("toggles leftover storage guide from action button and renders on final step", async () => {
    const user = userEvent.setup()
    setup()

    expect(await screen.findByText("Cơm gà bữa 2")).toBeInTheDocument()

    // Top bar storage button
    const storageBtn = screen.getByTestId("cooking-storage-guide-btn")
    expect(storageBtn).toBeInTheDocument()

    // Click to show storage guide
    await user.click(storageBtn)
    expect(screen.getByTestId("cooking-storage-guide-section")).toBeInTheDocument()
    expect(screen.getByTestId("leftover-storage-guide-card")).toBeInTheDocument()
    expect(screen.getByText("Bảo quản thức ăn thừa sau nấu")).toBeInTheDocument()

    // Toggle off
    await user.click(storageBtn)
    expect(screen.queryByTestId("cooking-storage-guide-section")).not.toBeInTheDocument()

    // Advance to final step (step 3 of 3)
    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))
    await user.click(screen.getByRole("button", { name: "Bước tiếp" }))

    // Final step automatically presents leftover storage guide section
    expect(screen.getByTestId("cooking-storage-guide-section")).toBeInTheDocument()
    expect(screen.getByTestId("leftover-storage-guide-card")).toBeInTheDocument()
  })

  test("toggles kitchen measurement converter from action bar and closes", async () => {
    const user = userEvent.setup()
    setup()

    expect(await screen.findByText("Cơm gà bữa 2")).toBeInTheDocument()

    expect(screen.queryByTestId("kitchen-measurement-modal")).not.toBeInTheDocument()

    const converterBtn = screen.getByTestId("cooking-measurement-converter-btn")
    expect(converterBtn).toBeInTheDocument()

    // Open converter modal
    await user.click(converterBtn)
    expect(screen.getByTestId("kitchen-measurement-modal")).toBeInTheDocument()
    expect(screen.getByText("Quy đổi đơn vị & Ước lượng bếp Việt")).toBeInTheDocument()

    // Close modal
    const measurementModal = screen.getByTestId("kitchen-measurement-modal")
    const closeBtn = within(measurementModal).getByRole("button", { name: "Đóng" })
    await user.click(closeBtn)
    expect(screen.queryByTestId("kitchen-measurement-modal")).not.toBeInTheDocument()
  })
})
