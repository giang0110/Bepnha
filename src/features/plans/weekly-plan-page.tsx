import { MemberPortionsPanel } from "./member-portions-panel"
import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"
import { Link } from "react-router"

import { loadHousehold } from "@/application/household/load-household"
import type { HouseholdRepository } from "@/application/household/household-repository"
import type {
  MealRating,
  MealRatingRepository,
  MealRatings
} from "@/application/meal-rating/meal-rating-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
import { useAuth } from "@/app/auth/auth-context"
import { AppPageShell } from "@/app/components/app-page-shell"
import { PageHeader } from "@/app/components/page-header"
import { Button, buttonVariants } from "@/app/components/ui/button"
import { Icon } from "@/app/components/ui/icon"
import { toast } from "@/app/components/ui/toast"
import type { HouseholdSetup } from "@/domain/household/household"

import { mealRoleLabel } from "./cooking-sequence"
import {
  describeIngredient,
  EMPTY_INGREDIENT_LABELS,
  ingredientLabels,
  type IngredientLabels
} from "./ingredient-labels"
import { nutrientName, orderedNutrients } from "./nutrition-labels"
import { safePlannerCorrelationId } from "./planner-api"
import type {
  PlanItemView,
  PlannerApi,
  PlannerPreviewResponse,
  PlannerReadyResponse,
  PlanRecipeIngredientView,
  PlanStepView
} from "./planner-api"
import { MealRatingControl } from "./meal-rating-control"
import { PlanTrustPanel } from "./plan-trust-panel"
import { ReplacementComparison } from "./replacement-comparison"
import { WeeklyNutritionOverviewPanel } from "./weekly-nutrition-overview"
import { WeeklyCookingScheduleCard } from "./weekly-cooking-schedule-card"
import { DailyPrepDefrostCard } from "./daily-prep-defrost-card"
import { extractPlanItemPrepTasks } from "./daily-prep-adapter"
import { generatePrepShareMessage, type PrepTask } from "@/domain/planner/meal-prep-defrost"
import { stepConditions, stepIngredientNames } from "./step-details"
import { currentWeekStart, nextWeekStart } from "./week-start"
import {
  detectProteinGroup,
  isWeekendDish,
  proteinGroupLabel,
  type ProteinGroup
} from "@/domain/planner/meal-rotation-insights"
import {
  computeWeeklyPlanFilterCounts,
  filterWeeklyPlanMeals
} from "@/domain/planner/weekly-plan-filter"
import { WeeklyPlanFilterBar } from "./weekly-plan-filter-bar"
import { detectDishThermalAffinity } from "@/domain/planner/seasonal-weather-insights"
import { solarToVietnameseLunar } from "@/domain/planner/vietnamese-lunar-calendar"
import { generateGoogleCalendarUrl } from "@/domain/planner/calendar-export"
import {
  formatWeeklyPlanShareText,
  type WeeklyPlanShareDishItem
} from "@/domain/planner/weekly-plan-share-text"
import { useFamilyWishlist } from "./family-wishlist-store"
import { WeeklyRotationBalanceCard } from "./weekly-rotation-balance-card"
import { loadCookingNote } from "./cooking-notes-store"
import { shareText } from "./share-text"
import { loadEatOutDays, toggleEatOutDay, type EatOutDayRecord } from "./eat-out-store"
import { EatOutModal } from "./eat-out-modal"

const FamilyCollaborationModal = lazy(async () => ({
  default: (await import("./family-collaboration-modal")).FamilyCollaborationModal
}))

const RecipePreviewModal = lazy(async () => ({
  default: (await import("./recipe-preview-modal")).RecipePreviewModal
}))

const DAY_LABELS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

function addDaysToIso(baseDate: string, days: number): string {
  const parts = baseDate.split("-").map(Number)
  const year = parts[0] ?? 2026
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  const d = new Date(year, month - 1, day + days, 12, 0, 0)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dt = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dt}`
}

function formatWeekRange(weekStart: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart)
  if (match === null) return weekStart
  const monday = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const day = (value: Date) => String(value.getDate()).padStart(2, "0")
  const month = (value: Date) => String(value.getMonth() + 1).padStart(2, "0")
  return `${day(monday)}/${month(monday)} – ${day(sunday)}/${month(sunday)}`
}

/**
 * Which of the seven days is today, or null when the week on screen is not the one being lived in.
 *
 * Returning null rather than clamping matters: highlighting Monday while the household is looking
 * at next week would be a confident lie about a day that has not happened.
 */
function todayIndexIn(weekStart: string, now: Date): number | null {
  return weekStart === currentWeekStart(now) ? (now.getDay() + 6) % 7 : null
}

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)
}

export interface WeeklyPlanAssistantSlotProps {
  readonly accessToken: string
  readonly planId: string
  readonly expectedRevisionId: string
  readonly onPreviewDay: (dayIndex: number) => void
}

export type WeeklyPlanAssistantRenderer = (props: WeeklyPlanAssistantSlotProps) => ReactNode

function AssistantSlot({
  renderer,
  ...props
}: WeeklyPlanAssistantSlotProps & Readonly<{ renderer: WeeklyPlanAssistantRenderer }>) {
  return <>{renderer(props)}</>
}

interface Props {
  readonly householdRepository: HouseholdRepository
  readonly plannerApi: PlannerApi
  /**
   * Supplies the names and unit codes the plan itself does not carry.
   *
   * The planner works entirely in identifiers so that a plan is reproducible from its snapshot, and
   * nothing about a food's Vietnamese name affects which meals it chooses. That is the right shape
   * for the engine and the wrong one for a person reading the page, so the names are looked up here
   * instead of being baked into the snapshot.
   */
  readonly foodOptionsRepository: PantryFoodOptionsRepository
  /**
   * Optional, so a screen that only shows the week does not have to carry it. Without it the rating
   * buttons are absent rather than inert: a control that cannot store an answer is worse than none.
   */
  readonly mealRatingRepository?: MealRatingRepository
  readonly renderAssistant?: WeeklyPlanAssistantRenderer
  readonly today?: () => Date
  readonly createId?: () => string
}

type ViewState =
  | { readonly status: "loading_household" | "loading_plan" | "idle" | "generating" }
  | { readonly status: "ready"; readonly value: PlannerReadyResponse }
  | {
      readonly status: "error"
      readonly code: string
      readonly correlationId?: string
      /**
       * Whether the failure was reading the week or doing something to it.
       *
       * They need different offers. A failed read left only "Tạo kế hoạch tuần" on screen, and
       * persistence refuses that for a week that already has a plan — so a transient read error
       * stranded the person behind a button that could not work.
       */
      readonly origin: "load" | "action"
    }

type PreviewState =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly dayIndex: number }
  | { readonly status: "ready"; readonly dayIndex: number; readonly value: PlannerPreviewResponse }
  | { readonly status: "error"; readonly code: string; readonly correlationId?: string }

function errorCopy(code: string): string {
  // Telling the reader to reload was advice this page could not honour: nothing here read an
  // existing plan, so a reload returned them to the same button and the same refusal.
  if (code === "STALE_PLAN_VERSION") {
    return "Kế hoạch tuần này vừa được thay đổi ở nơi khác. Hãy tải lại trang để xem bản mới nhất."
  }
  if (code === "DEPENDENCY_SCHEMA_NOT_READY")
    return "Máy chủ chưa sẵn sàng lập thực đơn dinh dưỡng. Hãy thử lại sau khi cập nhật. Thực đơn cũ vẫn xem được."
  if (code === "INCOMPLETE_CATALOG_LINEAGE")
    return "Danh mục thực phẩm chưa đủ quy đổi và quy tắc khẩu phần để tạo tuần. Hãy thử lại sau khi dữ liệu được cập nhật. Kế hoạch đã lưu vẫn xem được."
  if (code === "INVALID_INDIVISIBLE_PANTRY_QUANTITY")
    return "Tủ bếp đang có số lẻ của thực phẩm dùng nguyên đơn vị, ví dụ trứng. Hãy sửa lại lượng thực tế trong Tủ bếp rồi tạo lại tuần."
  if (code === "PANTRY_QUANTITY_POLICY_REQUIRED")
    return "Thực phẩm trong kho chưa có quy đổi nguyên đơn vị được xác minh. Hãy cập nhật mục kho đó hoặc dữ liệu thực phẩm trước khi lập thực đơn."
  if (code === "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED") {
    return "Thông tin gia đình đã thay đổi. Vui lòng tạo lại kế hoạch tuần."
  }
  if (code === "NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH") {
    return "Chưa tìm thấy kế hoạch đủ 7 bữa trong phạm vi tìm kiếm tất định."
  }
  if (code === "HARD_FILTER_EXHAUSTED") {
    return "Không còn bữa phù hợp trong danh mục đã tải với các điều kiện bắt buộc hiện tại."
  }
  if (code === "REPLACEMENT_UNAVAILABLE_WITHIN_DETERMINISTIC_SEARCH") {
    return "Chưa tìm thấy bữa thay thế trong phạm vi tìm kiếm tất định."
  }
  if (code === "UNAUTHORIZED") return "Phiên đăng nhập đã hết hạn."
  return "Không thể xử lý kế hoạch lúc này. Vui lòng thử lại."
}

function householdSettingsCanHelp(code: string): boolean {
  return [
    "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED",
    "HARD_FILTER_EXHAUSTED",
    "UNSUPPORTED_HARD_RULE"
  ].includes(code)
}

function SupportReference({ correlationId }: Readonly<{ correlationId: string | undefined }>) {
  const safeId = safePlannerCorrelationId(correlationId)
  return safeId === undefined ? null : (
    <p className="mt-1 text-xs text-ink-soft">
      Mã hỗ trợ: <code>{safeId}</code>
    </p>
  )
}

function warningCopy(
  warning: PlannerReadyResponse["warnings"][number],
  plan: PlannerReadyResponse
): string | null {
  if (warning.code === "PLAN_OVER_BUDGET") {
    const overage =
      typeof warning.overageVnd === "number"
        ? warning.overageVnd
        : plan.plan.totalEstimatedCostVnd - plan.budgetVnd
    return `Kế hoạch sẵn sàng nhưng vượt ngân sách ${formatVnd(overage)} VND.`
  }
  if (warning.code === "NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH") {
    return "Không tìm thấy kế hoạch dưới ngân sách trong phạm vi tìm kiếm tất định."
  }
  if (warning.code === "STALE_PRICE") return "Một số giá cũ nhưng vẫn còn dùng được để ước tính."
  return null
}

/**
 * What a step needs beyond its sentence: how long, how hot, and which ingredients it reaches for.
 *
 * Rendered under the instruction rather than inside it, so a step that says none of these reads
 * exactly as it did before. Nothing here is inferred — an absent timer or heat level simply does
 * not appear.
 */
function CookingStepDetail({
  step,
  ingredients,
  labels
}: Readonly<{
  step: PlanStepView
  ingredients: readonly PlanRecipeIngredientView[]
  labels: IngredientLabels
}>) {
  const conditions = stepConditions(step)
  const names = stepIngredientNames(step, ingredients, labels)
  if (conditions.length === 0 && names.length === 0) return null

  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      {conditions.map((condition) => (
        <span
          className="rounded-full bg-broth-50 px-2 py-0.5 font-bold text-broth-900"
          key={condition}
        >
          {condition}
        </span>
      ))}
      {names.length > 0 && (
        <span className="font-medium text-ink-soft">Nguyên liệu: {names.join(", ")}</span>
      )}
    </span>
  )
}

/**
 * How much of the budget the week uses, as a proportion rather than only a number.
 *
 * "650.000 / 700.000" is arithmetic a tired person has to do. The bar answers the actual question —
 * how close is this to the limit — at a glance, and turns chilli when it is past it. The figure
 * stays above it: the bar is the summary, not the source, and a proportion alone would be a vaguer
 * claim than the app can make.
 *
 * It is `aria-hidden` on purpose. A screen reader already had the two numbers in the line above, so
 * announcing a progressbar would repeat them less precisely.
 */
function BudgetMeter({ spentVnd, budgetVnd }: Readonly<{ spentVnd: number; budgetVnd: number }>) {
  if (!Number.isFinite(budgetVnd) || budgetVnd <= 0) return null

  const share = spentVnd / budgetVnd
  const over = share > 1
  const width = `${Math.min(Math.max(share, 0), 1) * 100}%`

  return (
    <div aria-hidden="true" className="mt-3">
      <div className="h-2 overflow-hidden rounded-full bg-paper-sunken">
        <div
          className={`h-full rounded-full ${over ? "bg-chilli-600" : "bg-herb-500"}`}
          style={{ width }}
        />
      </div>
      <p className={`mt-1.5 text-xs font-semibold ${over ? "text-chilli-700" : "text-ink-soft"}`}>
        {over
          ? `Vượt ${formatVnd(spentVnd - budgetVnd)} VND`
          : `Còn lại ${formatVnd(budgetVnd - spentVnd)} VND`}
      </p>
    </div>
  )
}

function MealDetails({
  item,
  labels,
  rating,
  onRate
}: Readonly<{
  item: PlanItemView
  labels: IngredientLabels
  rating: MealRating | null
  onRate: (mealOptionId: string, rating: MealRating | null) => void
}>) {
  return (
    <details className="group/details mt-4 rounded-2xl bg-paper-sunken px-4 py-3 text-sm">
      <summary className="flex cursor-pointer items-center justify-between gap-2 font-bold text-herb-700">
        Xem cách nấu và dinh dưỡng
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-full bg-herb-100 text-herb-700 transition-transform group-open/details:rotate-180"
        >
          <svg className="size-3.5" fill="none" viewBox="0 0 24 24">
            <path
              d="m6 9 6 6 6-6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
          </svg>
        </span>
      </summary>
      {item.memberPortions ? (
        <div className="mt-4">
          <MemberPortionsPanel
            portions={item.memberPortions}
            plannedMealSharePercent={item.plannedMealSharePercent ?? null}
          />
        </div>
      ) : null}
      <div className="mt-4 grid gap-4">
        <section>
          <h4 className="flex items-center gap-1.5 font-bold text-ink">
            <Icon name="leaf" className="size-4 text-herb-600" />
            Nguyên liệu đã định lượng
          </h4>
          <ul className="mt-2 grid gap-1">
            {item.scaledIngredients.map((ingredient) => (
              <li
                className="rounded-2xl bg-paper-raised px-3 py-1.5 text-ink-soft"
                key={ingredient.sourceId}
              >
                {describeIngredient(ingredient, labels)}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h4 className="flex items-center gap-1.5 font-bold text-ink">
            <Icon name="pan" className="size-4 text-clay-700" />
            Cách nấu nhanh
          </h4>
          {item.components
            .toSorted((left, right) => left.sortOrder - right.sortOrder)
            .map((component) => (
              <div className="mt-3" key={component.recipe.recipeVersionId}>
                <h5 className="inline-flex rounded-full bg-clay-50 px-2.5 py-0.5 text-xs font-bold text-clay-900">
                  {mealRoleLabel(component.mealRole)}
                </h5>
                <ol className="mt-2 grid list-outside list-decimal gap-2 pl-5 marker:font-extrabold marker:text-herb-700">
                  {component.recipe.steps
                    .toSorted((left, right) => left.order - right.order)
                    .map((step) => (
                      <li key={step.order}>
                        {step.instructionVi}
                        <CookingStepDetail
                          ingredients={component.recipe.ingredients}
                          labels={labels}
                          step={step}
                        />
                      </li>
                    ))}
                </ol>
              </div>
            ))}
        </section>
        <section>
          <h4 className="flex items-center gap-1.5 font-bold text-ink">
            <Icon name="soup" className="size-4 text-broth-700" />
            Dinh dưỡng ước tính cho cả bữa
          </h4>
          <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge sm:grid-cols-3">
            {orderedNutrients(item.nutrition.nutrients).map((nutrient) => (
              <div className="bg-paper-raised px-3 py-2" key={nutrient.nutrientCode}>
                <dt className="text-xs font-medium text-ink-soft">
                  {nutrientName(nutrient.nutrientCode)}
                </dt>
                <dd className="mt-0.5 font-bold text-ink tabular-nums">
                  {nutrient.displayAmount} {nutrient.unitCode}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <MealRatingControl mealOptionId={item.mealOptionId} rating={rating} onRate={onRate} />
      </div>
    </details>
  )
}

export function WeeklyPlanPage({
  foodOptionsRepository,
  householdRepository,
  mealRatingRepository,
  plannerApi,
  renderAssistant,
  today = () => new Date(),
  createId = () => crypto.randomUUID()
}: Props) {
  const auth = useAuth()
  const [labels, setLabels] = useState<IngredientLabels>(EMPTY_INGREDIENT_LABELS)
  const [household, setHousehold] = useState<HouseholdSetup | null>(null)
  const [householdLoadAttempt, setHouseholdLoadAttempt] = useState(0)
  const [state, setState] = useState<ViewState>({ status: "loading_household" })
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" })
  const previewDialogRef = useRef<HTMLDialogElement>(null)
  const previewHeadingRef = useRef<HTMLHeadingElement>(null)
  const previewTriggerRef = useRef<HTMLElement | null>(null)
  const assistantSummaryRef = useRef<HTMLElement>(null)
  const [regenerationError, setRegenerationError] = useState<{
    readonly code: string
    readonly correlationId?: string
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  /**
   * Which week the page is about.
   *
   * Defaults to the one the household is living in, because that is the plan they are cooking from
   * today. Planning ahead is a deliberate move to a different week rather than something the page
   * does to them silently from Tuesday onward.
   */
  const [weekStart, setWeekStart] = useState(() => currentWeekStart(today()))
  const [ratings, setRatings] = useState<MealRatings>({ liked: [], disliked: [] })
  const [showFamilyModal, setShowFamilyModal] = useState(false)
  const [previewRecipeItem, setPreviewRecipeItem] = useState<PlanItemView | null>(null)
  const [previewRecipeTab, setPreviewRecipeTab] = useState<
    "ingredients" | "steps" | "nutrition" | "notes" | "condiments"
  >("ingredients")
  const [, setNotesVersion] = useState(0)
  const familyWishes = useFamilyWishlist(household?.householdId ?? null)
  const currentRevisionId = state.status === "ready" ? state.value.revisionId : null
  const [eatOutRecordsOverride, setEatOutRecordsOverride] = useState<{
    readonly revisionId: string
    readonly records: readonly EatOutDayRecord[]
  } | null>(null)
  const [eatOutModalTarget, setEatOutModalTarget] = useState<PlanItemView | null>(null)

  const eatOutRecords = useMemo(() => {
    if (!currentRevisionId) return []
    if (eatOutRecordsOverride && eatOutRecordsOverride.revisionId === currentRevisionId) {
      return eatOutRecordsOverride.records
    }
    return loadEatOutDays(
      typeof window !== "undefined" ? window.localStorage : undefined,
      currentRevisionId
    )
  }, [currentRevisionId, eatOutRecordsOverride])

  const eatOutDayIndices = useMemo(() => eatOutRecords.map((r) => r.dayIndex), [eatOutRecords])

  const [mealSearchQuery, setMealSearchQuery] = useState("")
  const deferredMealSearchQuery = useDeferredValue(mealSearchQuery)
  const [activeProteinFilter, setActiveProteinFilter] = useState<ProteinGroup | "all">("all")
  const [quickCookOnly, setQuickCookOnly] = useState(false)
  const [coolingOnly, setCoolingOnly] = useState(false)

  const sortedPlanItems = useMemo(() => {
    if (state.status !== "ready") return []
    return [...state.value.plan.items].sort((left, right) => left.dayIndex - right.dayIndex)
  }, [state])

  const mealFilterCounts = useMemo(
    () => computeWeeklyPlanFilterCounts(sortedPlanItems),
    [sortedPlanItems]
  )

  const filteredPlanItems = useMemo(
    () =>
      filterWeeklyPlanMeals(sortedPlanItems, {
        keyword: deferredMealSearchQuery,
        proteinGroup: activeProteinFilter,
        cookTime: quickCookOnly ? "quick_30" : "all",
        thermalAffinity: coolingOnly ? "cooling" : "all"
      }),
    [sortedPlanItems, deferredMealSearchQuery, activeProteinFilter, quickCookOnly, coolingOnly]
  )

  const handleResetMealFilters = () => {
    setMealSearchQuery("")
    setActiveProteinFilter("all")
    setQuickCookOnly(false)
    setCoolingOnly(false)
  }

  const todayIndex = useMemo(() => todayIndexIn(weekStart, today()), [weekStart, today])
  const todayMeal = useMemo(
    () =>
      todayIndex === null ? undefined : sortedPlanItems.find((c) => c.dayIndex === todayIndex),
    [todayIndex, sortedPlanItems]
  )
  const todayPrepTasks = useMemo(() => {
    if (!todayMeal) return []
    return extractPlanItemPrepTasks(todayMeal, labels)
  }, [todayMeal, labels])

  useEffect(() => {
    if (preview.status !== "ready") return
    const dialog = previewDialogRef.current
    const trigger = previewTriggerRef.current
    const assistantSummary = assistantSummaryRef.current
    if (dialog === null) return
    if (!dialog.open) dialog.showModal()
    previewHeadingRef.current?.focus()
    return () => {
      if (dialog.open) dialog.close()
      if (trigger?.isConnected) trigger.focus()
      else if (assistantSummary?.isConnected) assistantSummary.focus()
    }
  }, [preview.status])

  useEffect(() => {
    let active = true
    void loadHousehold(householdRepository).then((result) => {
      if (!active) return
      if (!result.ok) {
        setState({ status: "error", code: result.reason, origin: "load" })
        return
      }
      setHousehold(result.household)
      // A session without a household row is a real state: signing up and leaving onboarding
      // half-done produces one, and RequireAuth checks only the session. Entering `loading_plan`
      // here promised a week that nothing would ever fetch, because the plan effect needs a
      // household id and returns immediately without one.
      setState(result.household === null ? { status: "idle" } : { status: "loading_plan" })
    })
    return () => {
      active = false
    }
  }, [householdRepository, householdLoadAttempt])

  useEffect(() => {
    if (mealRatingRepository === undefined || household === null) return
    let active = true
    void mealRatingRepository
      .load(household.householdId)
      .then((value) => {
        if (active) setRatings(value)
      })
      .catch(() => {
        // Ratings are a preference, not the plan. Losing them costs the household two buttons, so
        // they are not worth turning the week into an error screen.
        if (active) setRatings({ liked: [], disliked: [] })
      })
    return () => {
      active = false
    }
  }, [mealRatingRepository, household])

  // Names are presentation only, so a lookup that fails leaves the plan readable rather than
  // replacing it with an error: `describeIngredient` falls back to the identifier and the quantity.
  useEffect(() => {
    let active = true
    void foodOptionsRepository
      .load()
      .then((options) => {
        if (active) setLabels(ingredientLabels(options))
      })
      .catch(() => {
        if (active) setLabels(EMPTY_INGREDIENT_LABELS)
      })
    return () => {
      active = false
    }
  }, [foodOptionsRepository])

  const accessToken = auth.session?.accessToken

  // A plan lives in the database, not in this component. Without this the week's plan was
  // unreachable after a reload, and the generate button was the only thing on offer — which
  // persistence then refused, because the week already had one.
  useEffect(() => {
    if (household === null || accessToken === undefined || state.status !== "loading_plan") return
    let active = true
    void plannerApi
      .current(accessToken, {
        householdId: household.householdId,
        weekStart
      })
      .then((result) => {
        if (!active) return
        if (!result.ok) {
          setState({
            status: "error",
            code: result.error,
            origin: "load",
            ...(result.correlationId === undefined ? {} : { correlationId: result.correlationId })
          })
          return
        }
        setState(
          result.value === null ? { status: "idle" } : { status: "ready", value: result.value }
        )
      })
    return () => {
      active = false
    }
  }, [household, accessToken, state.status, plannerApi, weekStart])

  function rateMeal(mealOptionId: string, rating: MealRating | null) {
    if (mealRatingRepository === undefined || household === null) return
    // Optimistic: the household sees its own answer at once, and a failed write puts the previous
    // answer back rather than leaving the button lying about what is stored.
    const previous = ratings
    setRatings({
      liked: [
        ...ratings.liked.filter((id) => id !== mealOptionId),
        ...(rating === "liked" ? [mealOptionId] : [])
      ],
      disliked: [
        ...ratings.disliked.filter((id) => id !== mealOptionId),
        ...(rating === "disliked" ? [mealOptionId] : [])
      ]
    })
    void mealRatingRepository.set(household.householdId, mealOptionId, rating).catch(() => {
      setRatings(previous)
    })
  }

  async function generate() {
    if (household === null || accessToken === undefined || submitting) return
    // Replacing a plan the week already has is a different request from making its first one, and
    // persistence tells them apart by the version being replaced. Sending it from what is on screen
    // keeps the concurrency check honest: a plan changed in another tab still fails.
    const previous = state.status === "ready" ? state : null
    const replacing =
      state.status === "ready"
        ? {
            expectedPlanVersion: state.value.planVersion,
            expectedCurrentRevisionId: state.value.revisionId
          }
        : {}
    setSubmitting(true)
    setRegenerationError(null)
    setPreview({ status: "idle" })
    setState({ status: "generating" })
    const result = await plannerApi.generate(accessToken, {
      householdId: household.householdId,
      weekStart,
      idempotencyKey: createId(),
      ...replacing
    })
    setSubmitting(false)
    if (!result.ok && previous !== null) {
      setState(previous)
      setRegenerationError({
        code: result.error,
        ...(result.correlationId === undefined ? {} : { correlationId: result.correlationId })
      })
      return
    }
    setState(
      result.ok
        ? { status: "ready", value: result.value }
        : {
            status: "error",
            code: result.error,
            origin: "action",
            ...(result.correlationId === undefined ? {} : { correlationId: result.correlationId })
          }
    )
  }

  async function previewDay(dayIndex: number, trigger?: HTMLElement) {
    if (state.status !== "ready" || accessToken === undefined || submitting) return
    previewTriggerRef.current =
      trigger ??
      (document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null)
    setSubmitting(true)
    setPreview({ status: "loading", dayIndex })
    const result = await plannerApi.preview(accessToken, {
      planId: state.value.planId,
      targetDayIndex: dayIndex,
      expectedPlanVersion: state.value.planVersion
    })
    setSubmitting(false)
    setPreview(
      result.ok
        ? { status: "ready", dayIndex, value: result.value }
        : {
            status: "error",
            code: result.error,
            ...(result.correlationId === undefined ? {} : { correlationId: result.correlationId })
          }
    )
  }

  async function applyPreview() {
    if (
      state.status !== "ready" ||
      preview.status !== "ready" ||
      accessToken === undefined ||
      submitting
    )
      return
    setSubmitting(true)
    const result = await plannerApi.apply(accessToken, {
      planId: state.value.planId,
      targetDayIndex: preview.dayIndex,
      expectedPlanVersion: state.value.planVersion,
      expectedCurrentRevisionId: state.value.revisionId,
      previewCalculationFingerprint: preview.value.previewFingerprint,
      idempotencyKey: createId()
    })
    setSubmitting(false)
    if (result.ok) {
      setState({ status: "ready", value: result.value })
      setPreview({ status: "idle" })
      setRegenerationError(null)
    } else {
      setPreview({
        status: "error",
        code: result.error,
        ...(result.correlationId === undefined ? {} : { correlationId: result.correlationId })
      })
    }
  }

  async function handleSharePlan() {
    if (state.status !== "ready") return

    const items: WeeklyPlanShareDishItem[] = state.value.plan.items.map((item) => {
      const dishes = item.mealOptionNameVi
        .split(/[,+]/)
        .map((d) => d.trim())
        .filter(Boolean)
      return {
        dayIndex: item.dayIndex,
        mealName: item.mealOptionNameVi,
        dishes: dishes.length > 0 ? dishes : [item.mealOptionNameVi]
      }
    })

    const text = formatWeeklyPlanShareText({
      weekStart,
      items
    })

    const title = `Thực đơn Bếp Nhà tuần ${formatWeekRange(weekStart)}`
    const outcome = await shareText(text, title, navigator)
    if (outcome === "copied") {
      toast.success("Đã sao chép thực đơn tuần vào bộ nhớ tạm!")
    } else if (outcome === "unavailable") {
      toast.error("Không thể chia sẻ hoặc sao chép trên thiết bị này.")
    }
  }

  const handleScrollToDay = useCallback((dayIndex: number) => {
    const el = document.getElementById(`meal-day-${dayIndex}`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [])

  const handleSharePrepReminder = useCallback(
    async (dayLabelVi: string, mealNameVi: string, tasks: readonly PrepTask[]) => {
      const message = generatePrepShareMessage(dayLabelVi, mealNameVi, tasks)
      const title = `Lời nhắc chuẩn bị bữa cơm ${dayLabelVi} — Bếp Nhà`
      const outcome = await shareText(message, title, navigator)
      if (outcome === "copied") {
        toast.success("Đã sao chép lời nhắc chuẩn bị & rã đông vào bộ nhớ tạm!")
      } else if (outcome === "unavailable") {
        toast.error("Không thể chia sẻ trên thiết bị này.")
      }
    },
    []
  )

  const handleOpenEatOutModal = useCallback((item: PlanItemView) => {
    setEatOutModalTarget(item)
  }, [])

  const handleConfirmEatOut = useCallback(
    (reason: string) => {
      if (!eatOutModalTarget || state.status !== "ready") return
      const next = toggleEatOutDay(
        typeof window !== "undefined" ? window.localStorage : undefined,
        state.value.revisionId,
        eatOutModalTarget.dayIndex,
        reason
      )
      setEatOutRecordsOverride({
        revisionId: state.value.revisionId,
        records: next
      })
      const targetLabel = DAY_LABELS[eatOutModalTarget.dayIndex]
      setEatOutModalTarget(null)
      toast.success(`Đã đánh dấu ${targetLabel} ăn ngoài / nghỉ nấu!`)
    },
    [eatOutModalTarget, state]
  )

  const handleCancelEatOut = useCallback(
    (dayIndex: number) => {
      if (state.status !== "ready") return
      const next = toggleEatOutDay(
        typeof window !== "undefined" ? window.localStorage : undefined,
        state.value.revisionId,
        dayIndex
      )
      setEatOutRecordsOverride({
        revisionId: state.value.revisionId,
        records: next
      })
      toast.info(`Đã chuyển ${DAY_LABELS[dayIndex]} về nấu tại nhà.`)
    },
    [state]
  )

  if (state.status === "loading_household") {
    return (
      <AppPageShell className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6 text-ink sm:px-6 lg:px-8 lg:py-8">
        <p role="status">Đang tải thông tin gia đình…</p>
      </AppPageShell>
    )
  }

  const setupNotice =
    state.status !== "ready" || household === null
      ? null
      : state.value.householdSetupVersion !== undefined &&
          state.value.householdSetupVersion < household.version
        ? "Thiết lập gia đình đã thay đổi. Kế hoạch và danh sách đi chợ này vẫn dùng khẩu phần lúc tạo. Hãy tạo lại kế hoạch tuần để áp dụng thiết lập mới."
        : household.nutritionSetup !== undefined &&
            state.value.engineVersion !== "planner-engine-v6"
          ? "Kế hoạch này chưa áp dụng khẩu phần theo hồ sơ thành viên và cách tính lượng thực phẩm mới. Hãy tạo lại kế hoạch tuần để cập nhật cả thực đơn và danh sách đi chợ."
          : null

  return (
    <AppPageShell className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6 text-ink sm:px-6 lg:px-8 lg:py-8">
      <div className="border-b border-edge pb-4 mb-2" data-print="only">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Thực đơn Bếp Nhà</h1>
            <p className="mt-1 text-sm font-medium text-ink-soft">
              Tuần {formatWeekRange(weekStart)}
            </p>
          </div>
          <p className="text-xs font-semibold text-herb-700">bepnha.app</p>
        </div>
      </div>

      <div data-print="hide">
        <PageHeader
          title="Kế hoạch tuần"
          description="Ngân sách chỉ áp dụng cho 7 bữa chính nấu cho cả gia đình."
        />
      </div>

      {/* Which week, said out loud. The page used to answer for the Monday ahead without ever
          naming it, so a household mid-week was looking at a different week from the one they
          thought they were looking at. */}
      <div
        aria-label="Tuần đang xem"
        className="flex w-full max-w-lg items-center gap-1 rounded-2xl border border-edge bg-paper-sunken p-1 text-sm"
        data-print="hide"
        role="group"
      >
        {(
          [
            ["Tuần này", currentWeekStart(today())],
            ["Tuần sau", nextWeekStart(today())]
          ] as const
        ).map(([label, value]) => (
          <button
            aria-pressed={weekStart === value}
            disabled={household === null || submitting}
            /* Stacked on purpose. Label and dates on one line wrapped at 320px, and only for the
               longer option, so the two choices came out different heights. */
            className={`min-h-14 flex-1 rounded-xl px-3 py-2 leading-tight transition-colors ${
              weekStart === value
                ? "bg-paper-raised text-herb-700 shadow-soft"
                : "text-ink-soft hover:text-ink"
            }`}
            key={value}
            type="button"
            onClick={() => {
              if (weekStart === value) return
              setWeekStart(value)
              setPreview({ status: "idle" })
              setRegenerationError(null)
              setState({ status: "loading_plan" })
            }}
          >
            <span className="block font-bold">{label}</span>
            {/* No opacity here. Fading `text-ink-soft` to 70% left the dates at 2.98:1 on the
                unselected half of the switcher, under the 4.5:1 this size of text needs. The size
                and the weight already say these are secondary to the label. */}
            <span className="block text-xs font-medium tabular-nums">{formatWeekRange(value)}</span>
          </button>
        ))}
      </div>

      {household === null && state.status !== "error" ? (
        <div className="grid justify-items-start gap-3" role="alert">
          <p>Hãy hoàn tất thông tin gia đình trước khi tạo kế hoạch.</p>
          {/* The sentence alone named the obstacle and left the person to find the way round it. */}
          <Link
            className="inline-flex min-h-11 items-center rounded-full bg-clay-700 px-5 text-sm font-bold text-on-clay shadow-soft transition-colors hover:bg-clay-900"
            to="/onboarding"
          >
            Hoàn tất thông tin gia đình
          </Link>
        </div>
      ) : null}

      {state.status === "loading_plan" ? <p role="status">Đang tải kế hoạch tuần…</p> : null}

      {setupNotice === null ? null : (
        <p className="rounded-2xl bg-broth-50 p-4 text-sm text-broth-900" role="alert">
          {setupNotice}
        </p>
      )}
      {regenerationError === null ? null : (
        <div className="rounded-2xl bg-broth-50 p-4 text-sm" role="alert">
          <p>{errorCopy(regenerationError.code)}</p>
          <SupportReference correlationId={regenerationError.correlationId} />
          <p className="mt-1">
            Kế hoạch cũ được giữ lại. Bạn có thể bấm Tạo lại kế hoạch tuần lần nữa.
          </p>
        </div>
      )}

      {(state.status === "idle" || state.status === "generating") && household !== null ? (
        <section
          aria-label="Tạo kế hoạch tuần"
          className="flex flex-col items-center justify-center rounded-3xl border border-herb-200 bg-gradient-to-b from-herb-50/70 to-paper-sunken/50 p-6 text-center shadow-soft sm:p-10"
        >
          <div className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-herb-100 text-herb-700 shadow-sm">
            <Icon name="soup" className="size-7" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
            Sẵn sàng cho thực đơn tuần mới!
          </h2>
          <p className="mt-2 max-w-lg text-sm text-ink-soft sm:text-base leading-relaxed">
            BepNha sẽ tự động cân đối dinh dưỡng, xoay vòng chất đạm hợp lý, và tối ưu chi phí đi
            chợ cho 7 bữa cơm nhà ấm cúng.
          </p>
          <div className="my-6 flex flex-wrap justify-center gap-2 text-xs text-ink-soft sm:gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-herb-200 bg-paper-raised px-3 py-1 font-medium shadow-2xs">
              <Icon name="leaf" className="size-3.5 text-herb-600" />
              Đủ canh, mặn, xào chuẩn vị
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-clay-200 bg-paper-raised px-3 py-1 font-medium shadow-2xs">
              <Icon name="cart" className="size-3.5 text-clay-600" />
              Tối ưu ngân sách gia đình
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-paper-raised px-3 py-1 font-medium shadow-2xs">
              <Icon name="clock" className="size-3.5 text-ink-soft" />
              Tiết kiệm thời gian chuẩn bị
            </span>
          </div>
          <Button
            disabled={submitting}
            size="lg"
            type="button"
            className="px-8 font-bold"
            onClick={() => void generate()}
          >
            {state.status === "generating" ? "Đang tạo kế hoạch…" : "Tạo kế hoạch 7 bữa chính"}
          </Button>
        </section>
      ) : null}

      {((state.status === "error" && state.origin === "action") || state.status === "ready") &&
      household !== null ? (
        <Button
          disabled={submitting}
          className="self-start"
          data-print="hide"
          size="lg"
          type="button"
          variant="outline"
          onClick={() => void generate()}
        >
          {state.status === "ready" ? "Tạo lại kế hoạch tuần" : "Tạo kế hoạch 7 bữa chính"}
        </Button>
      ) : null}

      {state.status === "error" ? (
        <div className="grid justify-items-start gap-3" role="alert" data-print="hide">
          <p>{errorCopy(state.code)}</p>
          <SupportReference correlationId={state.correlationId} />
          {/* Reading the week again is the right offer for a read that failed. Generating is not:
              persistence refuses a second plan for a week that already has one, so the button that
              used to be here could not do what the message asked for. */}
          {state.origin === "load" ? (
            <Button
              type="button"
              onClick={() => {
                if (household === null) {
                  setState({ status: "loading_household" })
                  setHouseholdLoadAttempt((attempt) => attempt + 1)
                } else {
                  setState({ status: "loading_plan" })
                }
              }}
            >
              Thử lại
            </Button>
          ) : null}
          {["INVALID_INDIVISIBLE_PANTRY_QUANTITY", "PANTRY_QUANTITY_POLICY_REQUIRED"].includes(
            state.code
          ) ? (
            <Link className={buttonVariants({ variant: "outline" })} to="/pantry">
              Sửa lượng trong Tủ bếp
            </Link>
          ) : null}
          {householdSettingsCanHelp(state.code) ? (
            <Link className={buttonVariants({ variant: "outline" })} to="/settings/household">
              Xem điều kiện gia đình
            </Link>
          ) : null}
        </div>
      ) : null}

      {state.status === "ready" ? (
        <>
          {(() => {
            if (todayMeal === undefined) return null
            const meal = todayMeal
            const todaySolar = addDaysToIso(weekStart, meal.dayIndex)
            const todayLunar = solarToVietnameseLunar(todaySolar)
            const todayProtein = detectProteinGroup(meal.mealOptionNameVi)
            const todayThermal = detectDishThermalAffinity(meal.mealOptionNameVi)
            return (
              /* The app is opened daily and organised weekly. Without this, answering "what am I
                 cooking tonight" meant counting down seven identical cards to find the right one. */
              <section
                aria-label={`Bữa hôm nay, ${DAY_LABELS[meal.dayIndex]}`}
                className="rounded-3xl border border-herb-200 bg-herb-50 p-5 shadow-soft"
                data-print="hide"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold tracking-wide text-herb-900 uppercase">
                    Hôm nay · {DAY_LABELS[meal.dayIndex]} ({todayLunar.formattedShort})
                  </p>
                  {todayLunar.isVegetarianDay && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-herb-700 px-2.5 py-0.5 text-xs font-bold text-on-herb">
                      <Icon name="leaf" className="size-3" />
                      {todayLunar.day === 15 ? "Hôm nay ngày Rằm" : "Hôm nay Mùng 1"}
                    </span>
                  )}
                  {todayThermal === "cooling" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-900">
                      <Icon name="leaf" className="size-3 text-blue-600" />
                      Thanh nhiệt
                    </span>
                  )}
                  {todayThermal === "warming" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                      <Icon name="flame" className="size-3 text-amber-700" />
                      Ấm nồng
                    </span>
                  )}
                  <span className="rounded-full bg-paper-sunken px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                    {proteinGroupLabel(todayProtein)}
                  </span>
                </div>
                <p className="mt-2 text-xl font-extrabold text-balance text-ink">
                  {meal.mealOptionNameVi}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink-soft">
                  <Icon name="clock" className="size-4" />
                  Tối đa {meal.elapsedMinutes} phút
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  {[...meal.components]
                    .toSorted((left, right) => left.sortOrder - right.sortOrder)
                    .map((component) => mealRoleLabel(component.mealRole))
                    .join(" · ")}
                </p>
                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 gap-2 bg-paper text-ink font-semibold"
                    onClick={() => {
                      setPreviewRecipeTab("ingredients")
                      setPreviewRecipeItem(meal)
                    }}
                    data-testid="preview-recipe-today"
                  >
                    <Icon name="note" className="size-4 text-herb-700" />
                    Công thức & Sơ chế
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 bg-paper text-ink font-semibold"
                    onClick={() => {
                      setPreviewRecipeTab("condiments")
                      setPreviewRecipeItem(meal)
                    }}
                    data-testid="preview-condiments-today"
                  >
                    <Icon name="bowl" className="size-4 text-amber-700" />
                    Nước chấm
                  </Button>
                  <a
                    aria-label={`Thêm bữa hôm nay ${meal.mealOptionNameVi} vào Google Calendar`}
                    className={buttonVariants({
                      variant: "outline",
                      className: "flex-1 gap-2 bg-paper font-semibold"
                    })}
                    data-testid="google-calendar-today"
                    href={generateGoogleCalendarUrl({
                      dateStr: todaySolar,
                      mealName: meal.mealOptionNameVi,
                      dishes: [meal.mealOptionNameVi]
                    })}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Icon name="calendar" className="size-4 text-herb-700" />
                    Lịch Google
                  </a>
                  <Link
                    aria-label={`Bắt đầu nấu bữa hôm nay: ${meal.mealOptionNameVi}`}
                    className={buttonVariants({
                      size: "default",
                      className: "flex-1 gap-2 font-bold"
                    })}
                    to={`/plan/${meal.dayIndex}/cook`}
                  >
                    <Icon name="pan" className="size-4" />
                    Bắt đầu nấu
                  </Link>
                </div>

                {todayPrepTasks.length > 0 && (
                  <div className="mt-4 border-t border-herb-200/80 pt-4" data-print="hide">
                    <DailyPrepDefrostCard
                      revisionId={state.value.revisionId}
                      dayIndex={meal.dayIndex}
                      dayLabelVi={DAY_LABELS[meal.dayIndex] ?? "Hôm nay"}
                      mealOptionNameVi={meal.mealOptionNameVi}
                      tasks={todayPrepTasks}
                      isEatOut={eatOutDayIndices.includes(meal.dayIndex)}
                      onShareReminder={(dayLabel, mealName, tasks) =>
                        void handleSharePrepReminder(dayLabel, mealName, tasks)
                      }
                    />
                  </div>
                )}
              </section>
            )
          })()}

          {todayMeal === undefined &&
            sortedPlanItems.length > 0 &&
            (() => {
              const firstMeal = sortedPlanItems[0]
              if (!firstMeal) return null
              const firstMealPrepTasks = extractPlanItemPrepTasks(firstMeal, labels)
              if (firstMealPrepTasks.length === 0) return null
              return (
                <div data-print="hide">
                  <DailyPrepDefrostCard
                    revisionId={state.value.revisionId}
                    dayIndex={firstMeal.dayIndex}
                    dayLabelVi={DAY_LABELS[firstMeal.dayIndex] ?? "Thứ Hai"}
                    mealOptionNameVi={firstMeal.mealOptionNameVi}
                    tasks={firstMealPrepTasks}
                    isEatOut={eatOutDayIndices.includes(firstMeal.dayIndex)}
                    onShareReminder={(dayLabel, mealName, tasks) =>
                      void handleSharePrepReminder(dayLabel, mealName, tasks)
                    }
                  />
                </div>
              )
            })()}

          <section
            className="rounded-3xl border border-edge bg-paper-raised p-5 sm:p-6"
            aria-label="Tổng quan ngân sách"
            data-print="hide"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-herb-700">
              <Icon name="basket" className="size-4" />
              Ước tính giỏ mua cho 7 bữa chính
            </p>
            <p className="mt-2 text-2xl font-extrabold tracking-tight text-ink tabular-nums">
              {formatVnd(state.value.plan.totalEstimatedCostVnd)} VND /{" "}
              {formatVnd(state.value.budgetVnd)} VND
            </p>
            <BudgetMeter
              budgetVnd={state.value.budgetVnd}
              spentVnd={state.value.plan.totalEstimatedCostVnd}
            />
            {state.value.warnings.map((warning, index) => {
              const copy = warningCopy(warning, state.value)
              return copy === null ? null : (
                <p
                  className="mt-3 rounded-2xl bg-broth-50 px-3 py-2 text-sm font-medium text-broth-900"
                  key={`${warning.code}:${index}`}
                >
                  {copy}
                </p>
              )
            })}
          </section>

          {state.value.engineVersion !== "planner-engine-v6" && setupNotice === null ? (
            <p className="rounded-2xl bg-paper-raised p-4 text-sm" data-print="hide">
              Thực đơn này dùng khẩu phần theo nhóm tuổi. Tạo lại tuần để áp dụng mục tiêu và cách
              tính lượng thực phẩm mới.
            </p>
          ) : null}
          {state.value.trust === undefined ? null : (
            <div data-print="hide">
              <PlanTrustPanel trust={state.value.trust} />
            </div>
          )}

          <WeeklyNutritionOverviewPanel items={sortedPlanItems} />

          <div data-print="hide">
            <WeeklyCookingScheduleCard
              items={sortedPlanItems}
              eatOutDays={eatOutDayIndices}
              onSelectDay={handleScrollToDay}
            />
          </div>

          {/* Not plain "Đi chợ": the navigation carries that name for the week's list in general,
              and two links reading the same while leading to different places is a guess the
              reader should not have to make. This one is the list for the plan on screen. */}
          <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center" data-print="hide">
            <Link
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-clay-700 px-5 text-sm font-bold text-on-clay transition-colors hover:bg-clay-900 sm:px-6"
              to={`/shopping/${state.value.planId}`}
            >
              <Icon name="cart" className="size-5" />
              Đi chợ cho kế hoạch này
            </Link>
            <Button
              className="min-h-12 gap-2 rounded-full px-5 font-bold"
              type="button"
              variant="outline"
              onClick={() => setShowFamilyModal(true)}
            >
              <Icon name="users" className="size-5 text-herb-700" />
              Gia đình & Chia sẻ
              {familyWishes.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-clay-100 px-2 py-0.5 text-xs font-bold text-clay-900">
                  <Icon name="heart" className="size-3 text-clay-700" />
                  {familyWishes.length}
                </span>
              )}
            </Button>
            <Button
              className="min-h-12 gap-2 rounded-full px-5 font-bold"
              data-testid="share-plan-button"
              type="button"
              variant="outline"
              onClick={() => void handleSharePlan()}
            >
              <Icon name="share" className="size-5 text-herb-700" />
              Chia sẻ thực đơn
            </Button>
            <Button
              className="min-h-12 gap-2 rounded-full px-5 font-bold"
              data-testid="print-plan-button"
              type="button"
              variant="outline"
              onClick={() => window.print()}
            >
              <Icon name="printer" className="size-5 text-herb-700" />
              In thực đơn
            </Button>
          </div>

          <WeeklyPlanFilterBar
            searchQuery={mealSearchQuery}
            onSearchChange={setMealSearchQuery}
            activeProtein={activeProteinFilter}
            onProteinChange={setActiveProteinFilter}
            quickCookOnly={quickCookOnly}
            onQuickCookToggle={() => setQuickCookOnly((prev) => !prev)}
            coolingOnly={coolingOnly}
            onCoolingToggle={() => setCoolingOnly((prev) => !prev)}
            counts={mealFilterCounts}
            totalMatches={filteredPlanItems.length}
            totalItems={sortedPlanItems.length}
            onResetFilters={handleResetMealFilters}
          />

          {filteredPlanItems.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-edge bg-paper-sunken p-8 text-center"
              data-testid="empty-filter-results"
            >
              <p className="text-base font-bold text-ink">Không tìm thấy bữa ăn phù hợp</p>
              <p className="mt-1 text-sm text-ink-soft">
                Thử tìm bằng từ khóa khác hoặc bỏ chọn bộ lọc để xem lại các bữa trong tuần.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 rounded-full font-bold"
                onClick={handleResetMealFilters}
              >
                Xem lại cả 7 bữa
              </Button>
            </div>
          ) : (
            <ol
              className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
              aria-label="Bảy bữa chính trong tuần"
            >
              {filteredPlanItems.map((item) => {
                const solarDate = addDaysToIso(weekStart, item.dayIndex)
                const lunar = solarToVietnameseLunar(solarDate)
                const protein = detectProteinGroup(item.mealOptionNameVi)
                const thermal = detectDishThermalAffinity(item.mealOptionNameVi)
                const isWeekend = item.dayIndex === 5 || item.dayIndex === 6
                const celebratory =
                  isWeekend && isWeekendDish(item.mealOptionNameVi, item.elapsedMinutes)
                const eatOutRecord = eatOutRecords.find((r) => r.dayIndex === item.dayIndex)
                const isEatOut = eatOutRecord !== undefined
                return (
                  <li
                    id={`meal-day-${item.dayIndex}`}
                    aria-label={`Bữa chính ${DAY_LABELS[item.dayIndex]}`}
                    className="flex min-w-0 flex-col rounded-3xl border border-edge bg-paper-raised p-5 sm:p-6"
                    key={item.dayIndex}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h2 className="inline-flex rounded-full bg-herb-50 px-3 py-1 text-xs font-bold tracking-wide text-herb-900">
                            {DAY_LABELS[item.dayIndex]}
                          </h2>
                          <span className="text-xs font-semibold text-ink-soft">
                            {lunar.formattedShort}
                          </span>
                          {isEatOut && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900"
                              title="Đã đánh dấu ngày ăn ngoài / nghỉ nấu"
                              data-testid={`meal-eat-out-tag-${item.dayIndex}`}
                            >
                              <span>🍜</span> Ăn ngoài
                            </span>
                          )}
                          {lunar.isVegetarianDay && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-herb-600 px-2 py-0.5 text-[11px] font-bold text-on-herb"
                              title={lunar.specialDayLabel ?? "Ngày ăn chay"}
                            >
                              <Icon name="leaf" className="size-3" />
                              {lunar.day === 15 ? "Rằm" : "Mùng 1"}
                            </span>
                          )}
                          {celebratory && (
                            <span
                              className="inline-flex items-center rounded-full bg-clay-100 px-2 py-0.5 text-[11px] font-bold text-clay-900"
                              title="Món ngon sum họp cuối tuần"
                            >
                              Cuối tuần
                            </span>
                          )}
                          {thermal === "cooling" && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                              title="Món thanh nhiệt, thanh mát"
                            >
                              <Icon name="leaf" className="size-3 text-blue-500" />
                              Thanh nhiệt
                            </span>
                          )}
                          {thermal === "warming" && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                              title="Món ấm nồng giữ nhiệt"
                            >
                              <Icon name="flame" className="size-3 text-amber-600" />
                              Ấm nồng
                            </span>
                          )}
                          <span className="inline-flex rounded-full bg-paper-sunken px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                            {proteinGroupLabel(protein)}
                          </span>
                          {typeof window !== "undefined" &&
                          Boolean(loadCookingNote(window.localStorage, item.mealOptionId)) ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewRecipeTab("notes")
                                setPreviewRecipeItem(item)
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-herb-200 bg-herb-50 px-2 py-0.5 text-[11px] font-bold text-herb-800 transition-colors hover:bg-herb-100"
                              data-testid={`meal-note-badge-${item.dayIndex}`}
                              title="Món ăn có mẹo & ghi chú gia đình (Bấm để xem)"
                            >
                              <Icon name="note" className="size-3 text-herb-700" />
                              Ghi chú riêng
                            </button>
                          ) : null}
                        </div>
                        <p
                          className="mt-3 text-lg font-extrabold leading-snug text-ink"
                          data-testid="meal-name"
                        >
                          {item.mealOptionNameVi}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink-soft">
                          <Icon name="clock" className="size-4" />
                          Tối đa {item.elapsedMinutes} phút
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5" data-print="hide">
                        <a
                          aria-label={`Thêm bữa ăn ${item.mealOptionNameVi} vào Google Calendar`}
                          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-edge bg-paper-raised text-ink-soft transition-colors hover:border-herb-300 hover:bg-herb-50/50 hover:text-herb-800"
                          data-testid={`google-calendar-meal-${item.dayIndex}`}
                          href={generateGoogleCalendarUrl({
                            dateStr: solarDate,
                            mealName: item.mealOptionNameVi,
                            dishes: [item.mealOptionNameVi]
                          })}
                          rel="noopener noreferrer"
                          target="_blank"
                          title="Thêm bữa ăn vào Google Calendar"
                        >
                          <Icon name="calendar" className="size-4 text-herb-700" />
                        </a>
                        <Button
                          disabled={submitting}
                          variant="outline"
                          type="button"
                          onClick={(event) => {
                            void previewDay(item.dayIndex, event.currentTarget)
                          }}
                        >
                          Đổi bữa
                        </Button>
                      </div>
                    </div>

                    {isEatOut && (
                      <div
                        className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-900"
                        data-testid={`eat-out-banner-${item.dayIndex}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-base" aria-hidden="true">
                              🍜
                            </span>
                            <div>
                              <p className="font-semibold text-xs sm:text-sm">
                                Nghỉ nấu / Ăn ngoài gia đình
                              </p>
                              <p className="text-xs text-amber-800 break-words">
                                {eatOutRecord.reasonNote ||
                                  "Thưởng thức ẩm thực bên ngoài hoặc nghỉ ngơi"}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs font-semibold text-amber-900 hover:bg-amber-200/60"
                            onClick={() => handleCancelEatOut(item.dayIndex)}
                            data-testid={`cancel-eat-out-btn-${item.dayIndex}`}
                          >
                            Nấu lại
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="mt-5 flex flex-col sm:flex-row gap-2" data-print="hide">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 gap-1.5 text-xs sm:text-sm font-semibold"
                        onClick={() => {
                          if (isEatOut) {
                            handleCancelEatOut(item.dayIndex)
                          } else {
                            handleOpenEatOutModal(item)
                          }
                        }}
                        data-testid={`mark-eat-out-btn-${item.dayIndex}`}
                        title={
                          isEatOut
                            ? "Hủy ăn ngoài, chuyển về nấu tại nhà"
                            : "Đánh dấu ngày ăn ngoài / nghỉ nấu"
                        }
                      >
                        {isEatOut ? "Nấu lại" : "Ăn ngoài 🍜"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 gap-1.5 text-xs sm:text-sm font-semibold"
                        onClick={() => {
                          setPreviewRecipeTab("ingredients")
                          setPreviewRecipeItem(item)
                        }}
                        data-testid={`preview-recipe-${item.dayIndex}`}
                      >
                        <Icon name="note" className="size-4 text-herb-700" />
                        Công thức & Sơ chế
                      </Button>
                      <Link
                        aria-label={`Bắt đầu nấu ${DAY_LABELS[item.dayIndex]}: ${item.mealOptionNameVi}`}
                        className={buttonVariants({
                          variant: "outline",
                          className: "flex-1 gap-1.5 text-xs sm:text-sm font-semibold"
                        })}
                        to={`/plan/${item.dayIndex}/cook`}
                      >
                        <Icon name="pan" className="size-4" />
                        Bắt đầu nấu
                      </Link>
                    </div>

                    <div data-print="hide">
                      <MealDetails
                        item={item}
                        labels={labels}
                        rating={
                          ratings.liked.includes(item.mealOptionId)
                            ? "liked"
                            : ratings.disliked.includes(item.mealOptionId)
                              ? "disliked"
                              : null
                        }
                        onRate={rateMeal}
                      />
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          <div data-print="hide">
            <WeeklyRotationBalanceCard items={state.value.plan.items} weekStart={weekStart} />
          </div>

          {accessToken === undefined || renderAssistant === undefined ? null : (
            <details
              className="rounded-3xl border border-edge bg-paper-raised p-4 shadow-soft"
              data-print="hide"
            >
              <summary ref={assistantSummaryRef} className="cursor-pointer font-bold text-ink">
                Hỏi trợ lý về kế hoạch
              </summary>
              <p className="mt-2 text-xs leading-5 text-ink-soft">
                Trợ lý chỉ giải thích kế hoạch hoặc gợi ý ngày nên xem lại; mọi phép tính và bữa
                thay thế vẫn do hệ thống tất định xử lý.
              </p>
              <div className="mt-3">
                <AssistantSlot
                  key={`${state.value.planId}:${state.value.revisionId}`}
                  renderer={renderAssistant}
                  accessToken={accessToken}
                  planId={state.value.planId}
                  expectedRevisionId={state.value.revisionId}
                  onPreviewDay={(dayIndex) => {
                    void previewDay(dayIndex)
                  }}
                />
              </div>
            </details>
          )}
        </>
      ) : null}

      {preview.status === "loading" ? <p role="status">Đang tìm bữa thay thế…</p> : null}
      {preview.status === "error" ? (
        <div className="grid justify-items-start gap-2" role="alert">
          <p>{errorCopy(preview.code)}</p>
          <SupportReference correlationId={preview.correlationId} />
          {["INVALID_INDIVISIBLE_PANTRY_QUANTITY", "PANTRY_QUANTITY_POLICY_REQUIRED"].includes(
            preview.code
          ) ? (
            <Link className={buttonVariants({ variant: "outline" })} to="/pantry">
              Sửa lượng trong Tủ bếp
            </Link>
          ) : null}
          {householdSettingsCanHelp(preview.code) ? (
            <Link className={buttonVariants({ variant: "outline" })} to="/settings/household">
              Xem điều kiện gia đình
            </Link>
          ) : null}
        </div>
      ) : null}
      {preview.status === "ready" ? (
        <dialog
          ref={previewDialogRef}
          className="fixed inset-x-4 top-auto bottom-[calc(var(--app-nav-height)+0.75rem)] m-0 mx-auto max-h-[calc(100svh-var(--app-nav-height)-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-herb-200 bg-paper-raised p-4 text-ink shadow-lift backdrop:bg-black/25 backdrop:backdrop-blur-[2px] sm:p-5 lg:left-auto lg:right-8 lg:mx-0 lg:w-[min(42rem,calc(100vw-19rem))]"
          aria-label="Xem trước bữa thay thế"
          onCancel={(event) => {
            event.preventDefault()
            if (!submitting) setPreview({ status: "idle" })
          }}
        >
          <h2 ref={previewHeadingRef} tabIndex={-1} className="font-bold text-ink">
            Xem trước thay đổi
          </h2>
          {(() => {
            const current =
              state.status === "ready"
                ? state.value.plan.items.find((item) => item.dayIndex === preview.dayIndex)
                : undefined
            const replacement = preview.value.items.find(
              (item) => item.dayIndex === preview.dayIndex
            )
            const isFamilyWished =
              replacement !== undefined &&
              familyWishes.some((w) => w.mealOptionId === replacement.mealOptionId)
            return current === undefined || replacement === undefined ? null : (
              <>
                {isFamilyWished && (
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-clay-100 px-3 py-1 text-xs font-bold text-clay-900">
                    <Icon name="heart" className="size-3.5 text-clay-700" />
                    Món này được người nhà bình chọn trong tuần!
                  </div>
                )}
                <ReplacementComparison
                  current={current}
                  replacement={replacement}
                  weeklyCostDeltaVnd={preview.value.costDeltaVnd}
                />
              </>
            )
          })()}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={submitting} type="button" onClick={() => void applyPreview()}>
              Áp dụng bữa thay thế
            </Button>
            <Button
              disabled={submitting}
              variant="outline"
              type="button"
              onClick={() => setPreview({ status: "idle" })}
            >
              Hủy thay đổi
            </Button>
          </div>
        </dialog>
      ) : null}

      {household !== null && state.status === "ready" && showFamilyModal && (
        <Suspense fallback={null}>
          <FamilyCollaborationModal
            availableMealOptions={state.value.plan.items.map((i) => ({
              id: i.mealOptionId,
              nameVi: i.mealOptionNameVi
            }))}
            householdId={household.householdId}
            householdName="Gia đình mình"
            initialWishes={familyWishes}
            isOpen={showFamilyModal}
            planItems={state.value.plan.items}
            weekStart={weekStart}
            onClose={() => setShowFamilyModal(false)}
          />
        </Suspense>
      )}

      {previewRecipeItem !== null && (
        <Suspense fallback={null}>
          <RecipePreviewModal
            key={`${previewRecipeItem.mealOptionId}-${previewRecipeTab}`}
            isOpen={previewRecipeItem !== null}
            item={previewRecipeItem}
            labels={labels}
            initialTab={previewRecipeTab}
            onClose={() => {
              setPreviewRecipeItem(null)
              setNotesVersion((v) => v + 1)
            }}
          />
        </Suspense>
      )}

      {eatOutModalTarget !== null && (
        <EatOutModal
          isOpen={eatOutModalTarget !== null}
          dayIndex={eatOutModalTarget.dayIndex}
          dayLabelVi={DAY_LABELS[eatOutModalTarget.dayIndex] ?? "Hôm nay"}
          mealOptionNameVi={eatOutModalTarget.mealOptionNameVi}
          onClose={() => setEatOutModalTarget(null)}
          onConfirm={handleConfirmEatOut}
        />
      )}
    </AppPageShell>
  )
}
