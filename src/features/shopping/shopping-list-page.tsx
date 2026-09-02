import { useEffect, useMemo, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router"

import type {
  ReadyShoppingList,
  ShoppingListItem,
  ShoppingListReadResult,
  ShoppingListRepository
} from "@/application/shopping/shopping-list-repository"
import { ShoppingListRepositoryError } from "@/application/shopping/shopping-list-repository"
import { AppPageShell } from "@/app/components/app-page-shell"
import {
  GROCERY_CATEGORIES,
  type GroceryCategoryDefinition
} from "@/domain/shopping/grocery-category-config"

const DAY_LABELS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]
const VI_COLLATOR = new Intl.Collator("vi", { sensitivity: "base" })

const UNIT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "70010000-0000-0000-0000-000000000001": "g",
  "70010000-0000-0000-0000-000000000002": "kg",
  "70010000-0000-0000-0000-000000000003": "ml",
  "70010000-0000-0000-0000-000000000004": "l",
  "70010000-0000-0000-0000-000000000005": "muỗng cà phê",
  "70010000-0000-0000-0000-000000000006": "muỗng canh",
  "70010000-0000-0000-0000-000000000007": "cái",
  "unit-g": "g",
  "unit-ml": "ml"
})

type ViewState =
  | { readonly status: "loading" }
  | { readonly status: "missing" }
  | { readonly status: "ready"; readonly value: ReadyShoppingList }
  | {
      readonly status: "legacy"
      readonly value: Extract<ShoppingListReadResult, { status: "legacy_unavailable" }>
    }
  | { readonly status: "error"; readonly message: string }

interface Props {
  readonly repository: ShoppingListRepository
}

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)
}

function formatQuantity(value: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value)
  if (match === null) return value
  const whole = BigInt(match[1]!).toLocaleString("vi-VN")
  const fractional = match[2]?.replace(/0+$/u, "") ?? ""
  return fractional === "" ? whole : `${whole},${fractional}`
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match === null) return value
  return `${match[3]}/${match[2]}/${match[1]}`
}

function unitLabel(baseUnitId: string): string {
  return UNIT_LABELS[baseUnitId] ?? "đơn vị cơ sở"
}

function errorCopy(error: unknown): string {
  if (error instanceof ShoppingListRepositoryError) {
    if (error.code === "UNAUTHORIZED") return "Phiên đăng nhập đã hết hạn."
    if (error.code === "INVALID_STORED_DATA") {
      return "Dữ liệu danh sách đi chợ không hợp lệ. Vui lòng tạo lại kế hoạch."
    }
  }
  return "Không thể tải danh sách đi chợ lúc này. Vui lòng thử lại."
}

function sortItems(left: ShoppingListItem, right: ShoppingListItem): number {
  const byName = VI_COLLATOR.compare(left.foodNameVi, right.foodNameVi)
  return byName !== 0 ? byName : left.foodId.localeCompare(right.foodId)
}

function categoryGroups(items: readonly ShoppingListItem[]) {
  return GROCERY_CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => item.groceryCategoryCode === category.code).toSorted(sortItems)
  })).filter((group) => group.items.length > 0)
}

function staleWarningCopy(value: ReadyShoppingList): string | null {
  const warnings = value.warnings.filter((warning) => warning.code === "STALE_PRICE")
  if (warnings.length === 0) return null
  const dates = [...new Set(warnings.map((warning) => formatDate(warning.observedAt)))]
  return `Giá ước tính có dữ liệu cũ nhưng vẫn dùng được, quan sát ngày ${dates.join(", ")}.`
}

function ShoppingItemRow({
  item,
  pending,
  onCheckedChange
}: Readonly<{
  item: ShoppingListItem
  pending: boolean
  onCheckedChange: (item: ShoppingListItem, checked: boolean) => void
}>) {
  const unit = unitLabel(item.baseUnitId)
  const hasPantryDeduction = item.pantryDeductedBaseQuantity !== "0"
  const needsPurchase = item.purchasePackageCount !== "0"

  return (
    <li
      className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm"
      data-testid={`shopping-item-${item.shoppingListItemId}`}
    >
      <div
        className="flex items-start gap-3"
        data-food-id={item.foodId}
        data-testid="shopping-item"
      >
        <input
          aria-label={item.foodNameVi}
          checked={item.checked}
          className="mt-1 size-5 shrink-0 accent-emerald-700"
          disabled={pending}
          type="checkbox"
          onChange={(event) => onCheckedChange(item, event.currentTarget.checked)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                className={item.checked ? "font-semibold line-through opacity-60" : "font-semibold"}
              >
                {item.foodNameVi}
              </h3>
              <p className="text-sm text-slate-600">
                Cần {formatQuantity(item.requiredBaseQuantity)} {unit}
              </p>
              {hasPantryDeduction ? (
                <div className="mt-1 grid gap-0.5 text-sm text-emerald-800">
                  <p>
                    Tủ bếp đã dùng {formatQuantity(item.pantryDeductedBaseQuantity)} {unit}
                  </p>
                  <p>
                    Còn cần mua {formatQuantity(item.purchaseRequiredBaseQuantity)} {unit}
                  </p>
                </div>
              ) : null}
            </div>
            <p className="shrink-0 text-sm font-semibold">{formatVnd(item.lineCostVnd)} VND</p>
          </div>
          {needsPurchase ? (
            <p className="mt-2 text-sm">
              Mua {formatQuantity(item.purchasePackageCount)} gói ×{" "}
              {formatQuantity(item.packageBaseQuantity)} {unit}
            </p>
          ) : (
            <p className="mt-2 text-sm font-medium text-emerald-800">Không cần mua thêm.</p>
          )}
          <p className="text-sm text-slate-600">
            Dư khoảng {formatQuantity(item.leftoverBaseQuantity)} {unit}
          </p>
          <details className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">Dùng cho bữa nào</summary>
            <ul className="mt-2 grid gap-1">
              {item.sources.map((source) => (
                <li key={`${source.mealPlanItemId}:${source.recipeIngredientId}`}>
                  {DAY_LABELS[source.dayIndex] ?? `Ngày ${source.dayIndex + 1}`}:{" "}
                  {source.mealOptionNameVi} · {formatQuantity(source.requiredBaseQuantity)}{" "}
                  {unitLabel(source.baseUnitId)}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </li>
  )
}

function CategorySection({
  category,
  items,
  pendingIds,
  onCheckedChange
}: Readonly<{
  category: GroceryCategoryDefinition
  items: readonly ShoppingListItem[]
  pendingIds: ReadonlySet<string>
  onCheckedChange: (item: ShoppingListItem, checked: boolean) => void
}>) {
  return (
    <section className="grid gap-2" data-testid="shopping-category">
      <h2 className="text-base font-semibold">{category.labelVi}</h2>
      <ul className="grid gap-2">
        {items.map((item) => (
          <ShoppingItemRow
            item={item}
            key={item.shoppingListItemId}
            pending={pendingIds.has(item.shoppingListItemId)}
            onCheckedChange={onCheckedChange}
          />
        ))}
      </ul>
    </section>
  )
}

export function ShoppingListPage({ repository }: Props) {
  const { planId = "" } = useParams<{ planId: string }>()
  const [searchParams] = useSearchParams()
  const revisionId = searchParams.get("revisionId")
  const [state, setState] = useState<ViewState>({ status: "loading" })
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [mutationError, setMutationError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      await Promise.resolve()
      if (!active) return
      setMutationError(null)

      if (planId === "") {
        setState({ status: "missing" })
        return
      }

      setState({ status: "loading" })
      try {
        const result = await repository.load(planId, revisionId)
        if (!active) return
        if (result === null) {
          setState({ status: "missing" })
        } else if (result.status === "legacy_unavailable") {
          setState({ status: "legacy", value: result })
        } else {
          setState({ status: "ready", value: result })
        }
      } catch (error: unknown) {
        if (active) setState({ status: "error", message: errorCopy(error) })
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [planId, repository, revisionId])

  const groups = useMemo(
    () => (state.status === "ready" ? categoryGroups(state.value.items) : []),
    [state]
  )

  async function setChecked(item: ShoppingListItem, checked: boolean) {
    if (state.status !== "ready" || pendingIds.has(item.shoppingListItemId)) return
    const before = item
    setMutationError(null)
    setPendingIds((current) => new Set(current).add(item.shoppingListItemId))
    setState({
      status: "ready",
      value: {
        ...state.value,
        items: state.value.items.map((entry) =>
          entry.shoppingListItemId === item.shoppingListItemId
            ? { ...entry, checked, checkedAt: checked ? entry.checkedAt : null }
            : entry
        )
      }
    })
    try {
      const result = await repository.setChecked(item.shoppingListItemId, checked)
      setState((current) =>
        current.status !== "ready"
          ? current
          : {
              status: "ready",
              value: {
                ...current.value,
                items: current.value.items.map((entry) =>
                  entry.shoppingListItemId === result.shoppingListItemId
                    ? { ...entry, checked: result.checked, checkedAt: result.checkedAt }
                    : entry
                )
              }
            }
      )
    } catch {
      setState((current) =>
        current.status !== "ready"
          ? current
          : {
              status: "ready",
              value: {
                ...current.value,
                items: current.value.items.map((entry) =>
                  entry.shoppingListItemId === before.shoppingListItemId ? before : entry
                )
              }
            }
      )
      setMutationError("Không thể cập nhật trạng thái. Vui lòng thử lại.")
    } finally {
      setPendingIds((current) => {
        const next = new Set(current)
        next.delete(item.shoppingListItemId)
        return next
      })
    }
  }

  const staleCopy = state.status === "ready" ? staleWarningCopy(state.value) : null
  const alertCopy = mutationError ?? staleCopy

  return (
    <AppPageShell className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 bg-stone-50 px-4 py-6 text-slate-950">
      <header className="grid gap-2">
        <p className="text-sm font-medium text-emerald-700">Bếp Nhà</p>
        <h1 className="text-2xl font-semibold">Đi chợ</h1>
        <p className="text-sm text-slate-600">
          Số lượng và giá là ước tính theo đúng phiên bản kế hoạch đã lưu.
        </p>
        <Link className="text-sm font-medium text-emerald-800 underline" to="/plan">
          Quay lại kế hoạch tuần
        </Link>
      </header>

      {state.status === "loading" ? <p role="status">Đang tải danh sách đi chợ…</p> : null}
      {state.status === "missing" ? (
        <p role="status">Không tìm thấy danh sách đi chợ cho kế hoạch này.</p>
      ) : null}
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
      {state.status === "legacy" ? (
        <section className="rounded-xl border border-stone-200 bg-white p-4" role="status">
          <p className="font-medium">Phiên bản kế hoạch cũ này không có danh sách đi chợ.</p>
          <p className="mt-1 text-sm text-slate-600">
            Bếp Nhà không tự tạo lại dữ liệu lịch sử để tránh thay đổi bằng chứng của phiên bản cũ.
          </p>
        </section>
      ) : null}

      {state.status === "ready" ? (
        <>
          <section className="rounded-xl bg-white p-4 shadow-sm" aria-label="Tổng quan đi chợ">
            <p className="text-sm text-slate-600">Tổng ước tính / ngân sách 7 bữa chính</p>
            <p className="text-xl font-semibold">
              {formatVnd(state.value.totalEstimatedCostVnd)} VND /{" "}
              {formatVnd(state.value.budgetVnd)} VND
            </p>
            {state.value.budgetStatus === "over" ? (
              <p className="mt-1 text-sm text-amber-800">
                Vượt ngân sách {formatVnd(state.value.overageVnd)} VND.
              </p>
            ) : (
              <p className="mt-1 text-sm text-emerald-800">Trong ngân sách dự kiến.</p>
            )}
          </section>

          {alertCopy === null ? null : (
            <p
              className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              role="alert"
            >
              {alertCopy}
            </p>
          )}

          <div className="grid gap-5">
            {groups.map(({ category, items }) => (
              <CategorySection
                category={category}
                items={items}
                key={category.code}
                pendingIds={pendingIds}
                onCheckedChange={(entry, checked) => void setChecked(entry, checked)}
              />
            ))}
          </div>
        </>
      ) : null}
    </AppPageShell>
  )
}
