import { useEffect, useState } from "react"
import { Link } from "react-router"

import { loadHousehold } from "@/application/household/load-household"
import type { HouseholdRepository } from "@/application/household/household-repository"
import { useAuth } from "@/app/auth/auth-context"
import { AppPageShell } from "@/app/components/app-page-shell"
import { Button } from "@/app/components/ui/button"
import type { HouseholdSetup } from "@/domain/household/household"

import { safePlannerCorrelationId } from "./planner-api"
import type {
  PlanItemView,
  PlannerApi,
  PlannerPreviewResponse,
  PlannerReadyResponse
} from "./planner-api"

const DAY_LABELS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)
}

interface Props {
  readonly householdRepository: HouseholdRepository
  readonly plannerApi: PlannerApi
  readonly today?: () => Date
  readonly createId?: () => string
}

type ViewState =
  | { readonly status: "loading_household" | "idle" | "generating" }
  | { readonly status: "ready"; readonly value: PlannerReadyResponse }
  | { readonly status: "error"; readonly code: string; readonly correlationId?: string }

type PreviewState =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly dayIndex: number }
  | { readonly status: "ready"; readonly dayIndex: number; readonly value: PlannerPreviewResponse }
  | { readonly status: "error"; readonly code: string; readonly correlationId?: string }

function nextMonday(date: Date): string {
  const value = new Date(date)
  value.setHours(12, 0, 0, 0)
  const day = value.getDay()
  const distance = day === 1 ? 0 : (8 - day) % 7
  value.setDate(value.getDate() + distance)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const dateOfMonth = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${dateOfMonth}`
}

function errorCopy(code: string): string {
  if (code === "STALE_PLAN_VERSION") return "Kế hoạch đã thay đổi. Vui lòng tải lại rồi thử lại."
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
    <p className="mt-1 text-xs text-slate-600">
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

function ingredientUnit(baseUnitId: string): string {
  if (baseUnitId.endsWith("unit-g") || baseUnitId === "unit-g") return "g"
  if (baseUnitId.endsWith("unit-ml") || baseUnitId === "unit-ml") return "ml"
  return "đơn vị cơ sở"
}

function MealDetails({ item }: Readonly<{ item: PlanItemView }>) {
  return (
    <details className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">Xem cách nấu và dinh dưỡng</summary>
      <div className="mt-3 grid gap-3">
        <section>
          <h4 className="font-semibold">Nguyên liệu đã định lượng</h4>
          <ul className="list-inside list-disc">
            {item.scaledIngredients.map((ingredient) => (
              <li key={ingredient.sourceId}>
                {ingredient.baseQuantity} {ingredientUnit(ingredient.baseUnitId)}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h4 className="font-semibold">Cách nấu nhanh</h4>
          <ol className="list-inside list-decimal">
            {item.components
              .toSorted((left, right) => left.sortOrder - right.sortOrder)
              .flatMap((component) => component.recipe.steps)
              .toSorted((left, right) => left.order - right.order)
              .map((step, index) => (
                <li key={`${step.order}:${index}`}>{step.instructionVi}</li>
              ))}
          </ol>
        </section>
        <section>
          <h4 className="font-semibold">Dinh dưỡng ước tính cho cả bữa</h4>
          <ul className="flex flex-wrap gap-2">
            {item.nutrition.nutrients.map((nutrient) => (
              <li className="rounded-full bg-white px-2 py-1" key={nutrient.nutrientCode}>
                {nutrient.displayAmount} {nutrient.unitCode}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </details>
  )
}

export function WeeklyPlanPage({
  householdRepository,
  plannerApi,
  today = () => new Date(),
  createId = () => crypto.randomUUID()
}: Props) {
  const auth = useAuth()
  const [household, setHousehold] = useState<HouseholdSetup | null>(null)
  const [state, setState] = useState<ViewState>({ status: "loading_household" })
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    void loadHousehold(householdRepository).then((result) => {
      if (!active) return
      if (!result.ok) {
        setState({ status: "error", code: result.reason })
        return
      }
      setHousehold(result.household)
      setState({ status: "idle" })
    })
    return () => {
      active = false
    }
  }, [householdRepository])

  const accessToken = auth.session?.accessToken

  async function generate() {
    if (household === null || accessToken === undefined || submitting) return
    setSubmitting(true)
    setState({ status: "generating" })
    const result = await plannerApi.generate(accessToken, {
      householdId: household.householdId,
      weekStart: nextMonday(today()),
      idempotencyKey: createId()
    })
    setSubmitting(false)
    setState(
      result.ok
        ? { status: "ready", value: result.value }
        : {
            status: "error",
            code: result.error,
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
      <AppPageShell className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 bg-stone-50 px-4 py-6 text-slate-950">
        <p role="status">Đang tải thông tin gia đình…</p>
      </AppPageShell>
    )
  }

  return (
    <AppPageShell className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 bg-stone-50 px-4 py-6 text-slate-950">
      <header className="grid gap-2">
        <p className="text-sm font-medium text-emerald-700">Bếp Nhà</p>
        <h1 className="text-2xl font-semibold">Kế hoạch tuần</h1>
        <p className="text-sm text-slate-600">
          Ngân sách chỉ áp dụng cho 7 bữa chính nấu cho cả gia đình.
        </p>
      </header>

      {household === null && state.status !== "error" ? (
        <p role="alert">Hãy hoàn tất thông tin gia đình trước khi tạo kế hoạch.</p>
      ) : null}

      {(state.status === "idle" || state.status === "generating" || state.status === "error") &&
      household !== null ? (
        <Button disabled={submitting} size="lg" type="button" onClick={() => void generate()}>
          {state.status === "generating" ? "Đang tạo kế hoạch…" : "Tạo kế hoạch 7 bữa chính"}
        </Button>
      ) : null}

      {state.status === "error" ? (
        <div role="alert">
          <p>{errorCopy(state.code)}</p>
          <SupportReference correlationId={state.correlationId} />
        </div>
      ) : null}

      {state.status === "ready" ? (
        <>
          <section className="rounded-xl bg-white p-4 shadow-sm" aria-label="Tổng quan ngân sách">
            <p className="text-sm text-slate-600">Ước tính giỏ mua cho 7 bữa chính</p>
            <p className="text-xl font-semibold">
              {formatVnd(state.value.plan.totalEstimatedCostVnd)} VND /{" "}
              {formatVnd(state.value.budgetVnd)} VND
            </p>
            {state.value.warnings.map((warning, index) => {
              const copy = warningCopy(warning, state.value)
              return copy === null ? null : (
                <p className="mt-2 text-sm text-amber-800" key={`${warning.code}:${index}`}>
                  {copy}
                </p>
              )
            })}
          </section>

          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white"
            to={`/shopping/${state.value.planId}`}
          >
            Đi chợ
          </Link>

          <ol className="grid gap-3" aria-label="Bảy bữa chính trong tuần">
            {[...state.value.plan.items]
              .sort((left, right) => left.dayIndex - right.dayIndex)
              .map((item) => (
                <li
                  aria-label={`Bữa chính ${DAY_LABELS[item.dayIndex]}`}
                  className="rounded-xl bg-white p-4 shadow-sm"
                  key={item.dayIndex}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">{DAY_LABELS[item.dayIndex]}</h2>
                      <p className="text-lg font-medium" data-testid="meal-name">
                        {item.mealOptionNameVi}
                      </p>
                      <p className="text-sm text-slate-600">Tối đa {item.elapsedMinutes} phút</p>
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
                  <MealDetails item={item} />
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
          className="sticky bottom-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-lg"
          aria-label="Xem trước bữa thay thế"
        >
          <h2 className="font-semibold">Xem trước thay đổi</h2>
          <p>
            {
              preview.value.items.find((item) => item.dayIndex === preview.dayIndex)
                ?.mealOptionNameVi
            }
          </p>
          <p className="text-sm text-slate-600">
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
