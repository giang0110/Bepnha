import { Fragment, useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router"

import { loadHousehold } from "@/application/household/load-household"
import type { HouseholdRepository } from "@/application/household/household-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
import { useAuth } from "@/app/auth/auth-context"
import { AppPageShell } from "@/app/components/app-page-shell"
import { Button, buttonVariants } from "@/app/components/ui/button"
import { Icon } from "@/app/components/ui/icon"
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
import { stepConditions, stepIngredientNames } from "./step-details"
import { planWeekStart } from "./week-start"

const DAY_LABELS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

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

function MealDetails({ item, labels }: Readonly<{ item: PlanItemView; labels: IngredientLabels }>) {
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
      </div>
    </details>
  )
}

export function WeeklyPlanPage({
  foodOptionsRepository,
  householdRepository,
  plannerApi,
  renderAssistant,
  today = () => new Date(),
  createId = () => crypto.randomUUID()
}: Props) {
  const auth = useAuth()
  const [labels, setLabels] = useState<IngredientLabels>(EMPTY_INGREDIENT_LABELS)
  const [household, setHousehold] = useState<HouseholdSetup | null>(null)
  const [state, setState] = useState<ViewState>({ status: "loading_household" })
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    void loadHousehold(householdRepository).then((result) => {
      if (!active) return
      if (!result.ok) {
        setState({ status: "error", code: result.reason, origin: "load" })
        return
      }
      setHousehold(result.household)
      setState({ status: "loading_plan" })
    })
    return () => {
      active = false
    }
  }, [householdRepository])

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
        weekStart: planWeekStart(today())
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
  }, [household, accessToken, state.status, plannerApi, today])

  async function generate() {
    if (household === null || accessToken === undefined || submitting) return
    // Replacing a plan the week already has is a different request from making its first one, and
    // persistence tells them apart by the version being replaced. Sending it from what is on screen
    // keeps the concurrency check honest: a plan changed in another tab still fails.
    const replacing =
      state.status === "ready"
        ? {
            expectedPlanVersion: state.value.planVersion,
            expectedCurrentRevisionId: state.value.revisionId
          }
        : {}
    setSubmitting(true)
    setState({ status: "generating" })
    const result = await plannerApi.generate(accessToken, {
      householdId: household.householdId,
      weekStart: planWeekStart(today()),
      idempotencyKey: createId(),
      ...replacing
    })
    setSubmitting(false)
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

  async function previewDay(dayIndex: number) {
    if (state.status !== "ready" || accessToken === undefined || submitting) return
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
    } else {
      setPreview({
        status: "error",
        code: result.error,
        ...(result.correlationId === undefined ? {} : { correlationId: result.correlationId })
      })
    }
  }

  if (state.status === "loading_household") {
    return (
      <AppPageShell className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6 text-ink sm:px-6 lg:px-8 lg:py-8">
        <p role="status">Đang tải thông tin gia đình…</p>
      </AppPageShell>
    )
  }

  return (
    <AppPageShell className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6 text-ink sm:px-6 lg:px-8 lg:py-8">
      <header className="grid gap-2">
        <p className="flex items-center gap-1.5 text-sm font-extrabold text-herb-700">
          <Icon name="bowl" className="size-4" />
          Bếp Nhà
        </p>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Kế hoạch tuần</h1>
        <p className="text-sm text-ink-soft">
          Ngân sách chỉ áp dụng cho 7 bữa chính nấu cho cả gia đình.
        </p>
      </header>

      {household === null && state.status !== "error" ? (
        <p role="alert">Hãy hoàn tất thông tin gia đình trước khi tạo kế hoạch.</p>
      ) : null}

      {state.status === "loading_plan" ? <p role="status">Đang tải kế hoạch tuần…</p> : null}

      {(state.status === "idle" ||
        state.status === "generating" ||
        (state.status === "error" && state.origin === "action") ||
        state.status === "ready") &&
      household !== null ? (
        <Button
          disabled={submitting}
          size="lg"
          type="button"
          variant={state.status === "ready" ? "outline" : "default"}
          onClick={() => void generate()}
        >
          {state.status === "generating"
            ? "Đang tạo kế hoạch…"
            : state.status === "ready"
              ? "Tạo lại kế hoạch tuần"
              : "Tạo kế hoạch 7 bữa chính"}
        </Button>
      ) : null}

      {state.status === "error" ? (
        <div className="grid justify-items-start gap-3" role="alert">
          <p>{errorCopy(state.code)}</p>
          <SupportReference correlationId={state.correlationId} />
          {/* Reading the week again is the right offer for a read that failed. Generating is not:
              persistence refuses a second plan for a week that already has one, so the button that
              used to be here could not do what the message asked for. */}
          {state.origin === "load" ? (
            <Button type="button" onClick={() => setState({ status: "loading_plan" })}>
              Thử lại
            </Button>
          ) : null}
        </div>
      ) : null}

      {state.status === "ready" ? (
        <>
          <section
            className="rounded-3xl border border-herb-100 bg-gradient-to-br from-herb-50 to-paper-raised p-5 shadow-soft"
            aria-label="Tổng quan ngân sách"
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

          <Link
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-clay-700 px-6 text-base font-bold text-white shadow-soft transition-all hover:bg-clay-900 hover:shadow-lift"
            to={`/shopping/${state.value.planId}`}
          >
            <Icon name="cart" className="size-5" />
            Đi chợ
          </Link>

          {accessToken === undefined || renderAssistant === undefined ? null : (
            <Fragment key={`${state.value.planId}:${state.value.revisionId}`}>
              {renderAssistant({
                accessToken,
                planId: state.value.planId,
                expectedRevisionId: state.value.revisionId,
                onPreviewDay: (dayIndex) => {
                  void previewDay(dayIndex)
                }
              })}
            </Fragment>
          )}

          <ol
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
            aria-label="Bảy bữa chính trong tuần"
          >
            {[...state.value.plan.items]
              .sort((left, right) => left.dayIndex - right.dayIndex)
              .map((item) => (
                <li
                  aria-label={`Bữa chính ${DAY_LABELS[item.dayIndex]}`}
                  className="rounded-3xl border border-edge bg-paper-raised p-5 shadow-soft transition-shadow hover:shadow-lift"
                  key={item.dayIndex}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="inline-flex rounded-full bg-herb-100 px-3 py-0.5 text-xs font-bold tracking-wide text-herb-900 uppercase">
                        {DAY_LABELS[item.dayIndex]}
                      </h2>
                      <p className="mt-2 text-lg font-bold text-ink" data-testid="meal-name">
                        {item.mealOptionNameVi}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink-soft">
                        <Icon name="clock" className="size-4" />
                        Tối đa {item.elapsedMinutes} phút
                      </p>
                    </div>
                    <Button
                      disabled={submitting}
                      variant="outline"
                      type="button"
                      onClick={() => void previewDay(item.dayIndex)}
                    >
                      Đổi bữa
                    </Button>
                  </div>
                  <Link
                    aria-label={`Bắt đầu nấu ${DAY_LABELS[item.dayIndex]}: ${item.mealOptionNameVi}`}
                    className={buttonVariants({ className: "mt-4 w-full gap-2" })}
                    to={`/plan/${item.dayIndex}/cook`}
                  >
                    <Icon name="pan" className="size-4" />
                    Bắt đầu nấu
                  </Link>
                  <MealDetails item={item} labels={labels} />
                </li>
              ))}
          </ol>
        </>
      ) : null}

      {preview.status === "loading" ? <p role="status">Đang tìm bữa thay thế…</p> : null}
      {preview.status === "error" ? (
        <div role="alert">
          <p>{errorCopy(preview.code)}</p>
          <SupportReference correlationId={preview.correlationId} />
        </div>
      ) : null}
      {preview.status === "ready" ? (
        <section
          className="sticky bottom-3 rounded-3xl border border-herb-200 bg-paper-raised p-4 shadow-lift"
          aria-label="Xem trước bữa thay thế"
        >
          <h2 className="font-bold text-ink">Xem trước thay đổi</h2>
          <p>
            {
              preview.value.items.find((item) => item.dayIndex === preview.dayIndex)
                ?.mealOptionNameVi
            }
          </p>
          <p className="text-sm text-ink-soft">
            {preview.value.costDeltaVnd >= 0 ? "Tăng" : "Giảm"}{" "}
            {formatVnd(Math.abs(preview.value.costDeltaVnd))} VND cho cả tuần
          </p>
          <div className="mt-3 flex gap-2">
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
        </section>
      ) : null}
    </AppPageShell>
  )
}
