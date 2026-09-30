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
import { Button } from "@/app/components/ui/button"
import {
  GROCERY_CATEGORIES,
  type GroceryCategoryDefinition
} from "@/domain/shopping/grocery-category-config"
import {
  categoryDestination,
  filterItemsByCheckStatus,
  filterItemsByDestination,
  type ShoppingCheckStatusFilter,
  type ShoppingDestination
} from "@/domain/shopping/shopping-destinations"
import { pantryRestockCandidates } from "@/domain/shopping/pantry-restock"
import { Icon } from "@/app/components/ui/icon"
import { toast } from "@/app/components/ui/toast"

import { shareText } from "./share-text"
import { ManualShoppingExtrasSection } from "./manual-shopping-extras-section"
import {
  discardQueuedShoppingCheck,
  loadQueuedShoppingChecks,
  queueShoppingCheck,
  replayQueuedShoppingChecks
} from "./offline-shopping-store"
import { shoppingListText } from "./shopping-list-text"
import { shoppingProgress } from "./shopping-progress"

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

/**
 * What is still to be picked up first, then what is already in the basket.
 *
 * A ticked line keeps its place in the aisle order otherwise, which means the thing a shopper is
 * looking for sits further down the list every time they succeed at finding one. Sinking the done
 * ones keeps the top of each section pointed at work that remains.
 */
function sortItems(left: ShoppingListItem, right: ShoppingListItem): number {
  if (left.checked !== right.checked) return left.checked ? 1 : -1
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
  queued,
  oneHandMode = false,
  onCheckedChange
}: Readonly<{
  item: ShoppingListItem
  pending: boolean
  queued: boolean
  oneHandMode?: boolean
  onCheckedChange: (item: ShoppingListItem, checked: boolean) => void
}>) {
  const unit = unitLabel(item.baseUnitId)
  const hasPantryDeduction = item.pantryDeductedBaseQuantity !== "0"
  const needsPurchase = item.purchasePackageCount !== "0"

  const handleCheckedChange = (checked: boolean) => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(35)
      } catch {
        // Haptic feedback is optional and gracefully fails if unsupported
      }
    }
    onCheckedChange(item, checked)
  }

  return (
    <li
      className={`rounded-2xl border border-edge bg-paper-raised transition-all ${
        oneHandMode ? "p-4 sm:p-5 ring-1 ring-herb-600/20 shadow-md" : "p-3 shadow-soft"
      } ${item.checked ? "bg-paper-sunken/60 opacity-80" : ""}`}
      data-testid={`shopping-item-${item.shoppingListItemId}`}
    >
      <div
        className="flex items-start gap-3.5"
        data-food-id={item.foodId}
        data-testid="shopping-item"
      >
        <input
          aria-label={item.foodNameVi}
          checked={item.checked}
          className={`shrink-0 accent-herb-600 transition-transform ${
            oneHandMode ? "mt-1 size-7 cursor-pointer hover:scale-105" : "mt-1 size-5"
          }`}
          data-print="hide"
          disabled={pending}
          type="checkbox"
          onChange={(event) => handleCheckedChange(event.currentTarget.checked)}
        />
        <span
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 border border-black"
          data-print="only"
        />
        <div className="min-w-0 flex-1">
          {/* What a person standing in an aisle needs, on one line: what it is, how much of it,
              what it costs. Everything else is evidence for the planning desk, and it moves into
              the panel below rather than onto the shelf in front of them. */}
          <div className="flex items-baseline justify-between gap-3">
            <h3
              className={
                item.checked
                  ? "min-w-0 font-semibold line-through opacity-60 " +
                    (oneHandMode ? "text-lg text-ink-soft" : "text-ink-soft")
                  : "min-w-0 font-semibold " + (oneHandMode ? "text-lg text-ink" : "text-ink")
              }
            >
              {item.foodNameVi}
            </h3>
            <p
              className={
                "shrink-0 font-semibold tabular-nums " +
                (oneHandMode ? "text-base text-herb-700" : "text-sm")
              }
            >
              {formatVnd(item.lineCostVnd)} VND
            </p>
          </div>
          <p className={"text-ink-soft " + (oneHandMode ? "text-sm mt-0.5" : "text-sm")}>
            {needsPurchase
              ? `Mua ${formatQuantity(item.purchasePackageCount)} gói × ${formatQuantity(item.packageBaseQuantity)} ${unit}`
              : "Không cần mua thêm"}
          </p>
          {queued ? <p className="text-xs font-medium text-broth-700">Chờ đồng bộ</p> : null}
          <details className="mt-2 rounded-2xl bg-paper-sunken px-3 py-2 text-sm" data-print="hide">
            <summary className="cursor-pointer font-medium">Chi tiết và dùng cho bữa nào</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-ink-soft">
              <dt>Cần</dt>
              <dd className="tabular-nums">
                {formatQuantity(item.requiredBaseQuantity)} {unit}
              </dd>
              {hasPantryDeduction ? (
                <>
                  <dt className="text-herb-700">Tủ bếp đã có</dt>
                  <dd className="text-herb-700 tabular-nums">
                    {formatQuantity(item.pantryDeductedBaseQuantity)} {unit}
                  </dd>
                  <dt className="text-herb-700">Còn phải mua</dt>
                  <dd className="text-herb-700 tabular-nums">
                    {formatQuantity(item.purchaseRequiredBaseQuantity)} {unit}
                  </dd>
                </>
              ) : null}
              <dt>Dư khoảng</dt>
              <dd className="tabular-nums">
                {formatQuantity(item.leftoverBaseQuantity)} {unit}
              </dd>
            </dl>
            <p className="mt-2 font-medium text-ink">Dùng cho bữa</p>
            <ul className="mt-1 grid gap-1">
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
  queuedIds,
  oneHandMode = false,
  onCheckedChange
}: Readonly<{
  category: GroceryCategoryDefinition
  items: readonly ShoppingListItem[]
  pendingIds: ReadonlySet<string>
  queuedIds: ReadonlySet<string>
  oneHandMode?: boolean
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
            oneHandMode={oneHandMode}
            pending={pendingIds.has(item.shoppingListItemId)}
            queued={queuedIds.has(item.shoppingListItemId)}
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
  const [queuedIds, setQueuedIds] = useState<ReadonlySet<string>>(new Set())
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const [restockNotice, setRestockNotice] = useState<string | null>(null)
  const [restocking, setRestocking] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

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
          const queue = loadQueuedShoppingChecks(window.localStorage, result.revisionId)
          const desired = new Map(
            queue.map((entry) => [entry.shoppingListItemId, entry.checked] as const)
          )
          setQueuedIds(new Set(queue.map((entry) => entry.shoppingListItemId)))
          setState({
            status: "ready",
            value: {
              ...result,
              items: result.items.map((item) =>
                desired.has(item.shoppingListItemId)
                  ? {
                      ...item,
                      checked: desired.get(item.shoppingListItemId) ?? item.checked,
                      checkedAt: null
                    }
                  : item
              )
            }
          })
        }
      } catch (error: unknown) {
        if (active) setState({ status: "error", message: errorCopy(error) })
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [planId, repository, revisionId, reloadToken])

  const readyRevisionId = state.status === "ready" ? state.value.revisionId : null

  useEffect(() => {
    if (readyRevisionId === null) return
    const exactRevisionId = readyRevisionId
    let active = true

    async function synchronize() {
      if (!navigator.onLine) return
      const outcome = await replayQueuedShoppingChecks(
        window.localStorage,
        exactRevisionId,
        (shoppingListItemId, checked) => repository.setChecked(shoppingListItemId, checked)
      )
      if (!active) return
      const remaining = loadQueuedShoppingChecks(window.localStorage, exactRevisionId)
      setQueuedIds(new Set(remaining.map((entry) => entry.shoppingListItemId)))
      if (outcome.applied > 0) {
        setSyncNotice(`Đã đồng bộ ${outcome.applied} thay đổi mua sắm.`)
      }
    }

    const onOnline = () => void synchronize()
    window.addEventListener("online", onOnline)
    void synchronize()
    return () => {
      active = false
      window.removeEventListener("online", onOnline)
    }
  }, [readyRevisionId, repository])

  const [destinationFilter, setDestinationFilter] = useState<ShoppingDestination>("all")
  const [statusFilter, setStatusFilter] = useState<ShoppingCheckStatusFilter>("all")
  const [oneHandMode, setOneHandMode] = useState<boolean>(() => {
    try {
      return (
        typeof window !== "undefined" &&
        window.localStorage.getItem("bepnha_shopping_one_hand_mode") === "true"
      )
    } catch {
      return false
    }
  })

  function toggleOneHandMode() {
    setOneHandMode((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem("bepnha_shopping_one_hand_mode", String(next))
      } catch {
        // storage optional
      }
      return next
    })
  }

  const channelCounts = useMemo(() => {
    if (state.status !== "ready") {
      return { all: 0, wet_market: 0, supermarket: 0, remaining: 0, checked: 0 }
    }
    const items = state.value.items
    return {
      all: items.length,
      remaining: items.filter((i) => !i.checked).length,
      checked: items.filter((i) => i.checked).length,
      wet_market: items.filter(
        (i) => !i.checked && categoryDestination(i.groceryCategoryCode) === "wet_market"
      ).length,
      supermarket: items.filter(
        (i) => !i.checked && categoryDestination(i.groceryCategoryCode) === "supermarket"
      ).length
    }
  }, [state])

  const displayedItems = useMemo(() => {
    if (state.status !== "ready") return []
    let items = state.value.items
    items = filterItemsByDestination(items, destinationFilter)
    items = filterItemsByCheckStatus(items, statusFilter)
    return items
  }, [state, destinationFilter, statusFilter])

  const groups = useMemo(() => categoryGroups(displayedItems), [displayedItems])

  // What finishing the trip would actually move. The database decides for real — it holds the
  // per-item latch — but the button should not invite a press that would move nothing.
  const restockCandidates = useMemo(
    () => (state.status === "ready" ? pantryRestockCandidates(state.value.items) : []),
    [state]
  )

  async function finishShopping() {
    if (state.status !== "ready" || restocking) return
    setRestocking(true)
    setRestockNotice(null)
    setMutationError(null)
    try {
      const result = await repository.applyToPantry(state.value.revisionId)
      setRestockNotice(
        result.transferredLineCount === 0
          ? "Chuyến này đã được tính vào tủ bếp từ trước."
          : `Đã cập nhật tủ bếp cho ${result.transferredLineCount} món.`
      )
      // The list now carries which lines are settled, so re-read it: without this the button keeps
      // counting lines it has just finished with.
      setReloadToken((token) => token + 1)
    } catch (error: unknown) {
      setMutationError(errorCopy(error))
    } finally {
      setRestocking(false)
    }
  }

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
      discardQueuedShoppingCheck(window.localStorage, {
        revisionId: state.value.revisionId,
        shoppingListItemId: item.shoppingListItemId
      })
      setQueuedIds((current) => {
        const next = new Set(current)
        next.delete(item.shoppingListItemId)
        return next
      })
    } catch (error: unknown) {
      const queueable =
        !navigator.onLine ||
        (error instanceof ShoppingListRepositoryError && error.code === "DEPENDENCY_UNAVAILABLE")
      if (queueable) {
        const stored = queueShoppingCheck(window.localStorage, {
          revisionId: state.value.revisionId,
          shoppingListItemId: item.shoppingListItemId,
          checked
        })
        if (stored) {
          setQueuedIds((current) => new Set(current).add(item.shoppingListItemId))
          setSyncNotice("Thay đổi đã lưu trên thiết bị và sẽ đồng bộ khi có mạng.")
          return
        }
      }
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
  const progress = state.status === "ready" ? shoppingProgress(state.value.items) : null

  async function shareList(dest: ShoppingDestination = destinationFilter) {
    if (state.status !== "ready") return
    const outcome = await shareText(
      shoppingListText(state.value, unitLabel, dest),
      dest === "wet_market"
        ? "Đi chợ (Chợ dân sinh) — Bếp Nhà"
        : dest === "supermarket"
          ? "Đi chợ (Siêu thị / Tạp hóa) — Bếp Nhà"
          : "Đi chợ — Bếp Nhà",
      navigator
    )
    setShareNotice(
      outcome === "copied"
        ? "Đã chép danh sách vào bộ nhớ tạm. Dán vào tin nhắn để gửi đi."
        : outcome === "unavailable"
          ? "Trình duyệt này không cho chia sẻ hoặc chép. Bạn có thể dùng nút In."
          : null
    )
    if (outcome === "copied") {
      toast.success("Đã sao chép danh sách đi chợ vào khay nhớ tạm!")
    } else if (outcome === "shared") {
      toast.success("Đã chia sẻ danh sách đi chợ thành công!")
    }
  }

  return (
    <AppPageShell className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6 text-ink sm:px-6 lg:px-8 lg:py-8">
      <header className="grid gap-2">
        <p className="flex items-center gap-1.5 text-sm font-extrabold text-herb-700">
          <Icon name="bowl" className="size-4" />
          Bếp Nhà
        </p>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Đi chợ</h1>
        <p className="text-sm text-ink-soft">
          Số lượng và giá là ước tính theo đúng phiên bản kế hoạch đã lưu.
        </p>
        <Link className="text-sm font-medium text-herb-700 underline" data-print="hide" to="/plan">
          Quay lại kế hoạch tuần
        </Link>
      </header>

      {state.status === "loading" ? <p role="status">Đang tải danh sách đi chợ…</p> : null}
      {state.status === "missing" ? (
        <p role="status">Không tìm thấy danh sách đi chợ cho kế hoạch này.</p>
      ) : null}
      {state.status === "error" ? (
        <div className="grid justify-items-start gap-3" role="alert">
          <p>{state.message}</p>
          <Button
            type="button"
            onClick={() => {
              setState({ status: "loading" })
              setReloadToken((token) => token + 1)
            }}
          >
            Thử lại
          </Button>
        </div>
      ) : null}
      {state.status === "legacy" ? (
        <section className="rounded-2xl border border-edge bg-paper-raised p-4" role="status">
          <p className="font-medium">Phiên bản kế hoạch cũ này không có danh sách đi chợ.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Bếp Nhà không tự tạo lại dữ liệu lịch sử để tránh thay đổi bằng chứng của phiên bản cũ.
          </p>
        </section>
      ) : null}

      {state.status === "ready" ? (
        <>
          {/* Sticky because the number a shopper checks most is the one they have to scroll back up
              to see, and a market is not a place for scrolling back up. The opaque strip is not
              decoration: a translucent card alone let the list show through the rounded corners
              beside it, so text slid past in the gap. */}
          <div
            className="sticky top-0 z-10 -mx-4 bg-paper-sunken px-4 pt-1 pb-2 sm:-mx-6 sm:px-6"
            data-print="static"
          >
            <section
              className="rounded-2xl bg-paper-raised p-4 shadow-soft"
              aria-label="Tổng quan đi chợ"
            >
              <p className="text-sm text-ink-soft">Tổng ước tính / ngân sách 7 bữa chính</p>
              <p className="text-xl font-bold text-ink">
                {formatVnd(state.value.totalEstimatedCostVnd)} VND /{" "}
                {formatVnd(state.value.budgetVnd)} VND
              </p>
              {state.value.budgetStatus === "over" ? (
                <p className="mt-1 text-sm text-broth-700">
                  Vượt ngân sách {formatVnd(state.value.overageVnd)} VND.
                </p>
              ) : (
                <p className="mt-1 text-sm text-herb-700">Trong ngân sách dự kiến.</p>
              )}
              {progress === null ? null : (
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span>Tiến độ mua sắm</span>
                    <span className="font-medium">
                      {progress.checkedCount}/{progress.totalCount} món
                    </span>
                  </div>
                  {/* Drawn rather than a native <progress>: the browser's own track is a flat grey
                    that belongs to no palette, and it was the one cold object on a warm page. The
                    role and values are the same, so assistive technology reads it identically. */}
                  <div
                    aria-label="Tiến độ mua sắm"
                    aria-valuemax={progress.totalCount}
                    aria-valuemin={0}
                    aria-valuenow={progress.checkedCount}
                    className="h-2 w-full overflow-hidden rounded-full bg-paper-sunken"
                    role="progressbar"
                  >
                    <div
                      className="h-full rounded-full bg-herb-600 transition-[width] duration-300"
                      style={{
                        width: `${progress.totalCount === 0 ? 0 : (progress.checkedCount / progress.totalCount) * 100}%`
                      }}
                    />
                  </div>
                  {/* The figure a shopper wants halfway down an aisle. Derived from the ticked lines,
                    which is why it sits under the stored total rather than beside it. */}
                  <p className="mt-3 text-sm text-ink-soft">
                    {progress.remainingCostVnd === 0 && progress.totalCount > 0
                      ? "Đã lấy đủ mọi thứ trong danh sách."
                      : `Còn phải mua khoảng ${formatVnd(progress.remainingCostVnd)} VND`}
                  </p>
                  {progress.pickedUpCostVnd === 0 ? null : (
                    <p className="text-sm text-herb-700">
                      Đã lấy {formatVnd(progress.pickedUpCostVnd)} VND
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>

          <div className="flex flex-wrap items-center gap-2" data-print="hide">
            <Button
              type="button"
              variant={oneHandMode ? "default" : "outline"}
              className={
                oneHandMode ? "bg-herb-700 font-bold text-white ring-2 ring-herb-500/40" : ""
              }
              onClick={toggleOneHandMode}
              data-testid="toggle-one-hand-mode"
            >
              <Icon name="check" className="size-4" />
              Chế độ Đi chợ 1 tay: {oneHandMode ? "BẬT" : "Tắt"}
            </Button>
            {/* Chỉ hiện khi thật sự có gì để cất. Một nút không làm gì cả thì tệ hơn là không có
                nút: nó khiến người ta tưởng đã cất rồi. */}
            {restockCandidates.length === 0 ? null : (
              <Button disabled={restocking} type="button" onClick={() => void finishShopping()}>
                <Icon name="basket" className="size-4" />
                {restocking
                  ? "Đang cất vào tủ bếp…"
                  : `Đi chợ xong, cập nhật ${restockCandidates.length} món`}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => void shareList(destinationFilter)}
            >
              <Icon name="basket" className="size-4" />
              {destinationFilter === "wet_market"
                ? "Gửi danh sách Chợ dân sinh"
                : destinationFilter === "supermarket"
                  ? "Gửi danh sách Siêu thị"
                  : "Gửi cho người đi chợ"}
            </Button>
            <Button type="button" variant="outline" onClick={() => window.print()}>
              In danh sách
            </Button>
          </div>

          {/* Destination & Status Filters */}
          <div
            className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between"
            data-print="hide"
          >
            <div
              className="flex flex-wrap items-center gap-1 rounded-xl bg-paper-sunken p-1 text-xs sm:text-sm font-medium"
              role="tablist"
              aria-label="Điểm mua"
            >
              <button
                type="button"
                role="tab"
                aria-selected={destinationFilter === "all"}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  destinationFilter === "all"
                    ? "bg-paper-raised font-bold text-ink shadow-soft"
                    : "text-ink-soft hover:text-ink"
                }`}
                onClick={() => setDestinationFilter("all")}
                data-testid="dest-filter-all"
              >
                Tất cả ({channelCounts.all})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={destinationFilter === "wet_market"}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  destinationFilter === "wet_market"
                    ? "bg-paper-raised font-bold text-herb-700 shadow-soft"
                    : "text-ink-soft hover:text-ink"
                }`}
                onClick={() => setDestinationFilter("wet_market")}
                data-testid="dest-filter-wet-market"
              >
                Chợ dân sinh {channelCounts.wet_market > 0 ? `(${channelCounts.wet_market})` : ""}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={destinationFilter === "supermarket"}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  destinationFilter === "supermarket"
                    ? "bg-paper-raised font-bold text-herb-700 shadow-soft"
                    : "text-ink-soft hover:text-ink"
                }`}
                onClick={() => setDestinationFilter("supermarket")}
                data-testid="dest-filter-supermarket"
              >
                Siêu thị / Tạp hóa{" "}
                {channelCounts.supermarket > 0 ? `(${channelCounts.supermarket})` : ""}
              </button>
            </div>

            <div
              className="flex items-center gap-1 rounded-xl bg-paper-sunken p-1 text-xs sm:text-sm font-medium"
              role="group"
              aria-label="Lọc trạng thái mua"
            >
              <button
                type="button"
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  statusFilter === "all"
                    ? "bg-paper-raised font-semibold text-ink shadow-soft"
                    : "text-ink-soft hover:text-ink"
                }`}
                onClick={() => setStatusFilter("all")}
                data-testid="status-filter-all"
              >
                Toàn bộ
              </button>
              <button
                type="button"
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  statusFilter === "remaining"
                    ? "bg-paper-raised font-semibold text-herb-700 shadow-soft"
                    : "text-ink-soft hover:text-ink"
                }`}
                onClick={() => setStatusFilter("remaining")}
                data-testid="status-filter-remaining"
              >
                Chưa lấy ({channelCounts.remaining})
              </button>
              <button
                type="button"
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  statusFilter === "checked"
                    ? "bg-paper-raised font-semibold text-ink shadow-soft"
                    : "text-ink-soft hover:text-ink"
                }`}
                onClick={() => setStatusFilter("checked")}
                data-testid="status-filter-checked"
              >
                Đã lấy ({channelCounts.checked})
              </button>
            </div>
          </div>

          {shareNotice === null ? null : (
            <p className="text-sm text-ink-soft" role="status">
              {shareNotice}
            </p>
          )}

          {restockNotice === null ? null : (
            <p className="text-sm text-herb-700" role="status">
              {restockNotice}
            </p>
          )}

          {syncNotice === null ? null : (
            <p className="text-sm text-broth-700" role="status">
              {syncNotice}
            </p>
          )}

          {alertCopy === null ? null : (
            <p
              className="rounded-2xl border border-broth-200 bg-broth-50 p-3 text-sm text-broth-900"
              role="alert"
            >
              {alertCopy}
            </p>
          )}

          {groups.length === 0 ? (
            <div
              className="rounded-2xl border border-edge bg-paper-raised p-6 text-center shadow-soft"
              role="status"
            >
              <Icon name="check" className="mx-auto mb-2 size-7 text-herb-600" />
              <p className="font-semibold text-ink">
                {statusFilter === "remaining"
                  ? "Tuyệt vời! Bạn đã lấy đủ mọi thứ trong danh mục này."
                  : "Không có nguyên liệu nào phù hợp với bộ lọc hiện tại."}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  setDestinationFilter("all")
                  setStatusFilter("all")
                }}
              >
                Xem toàn bộ danh sách
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
              {groups.map(({ category, items }) => (
                <CategorySection
                  category={category}
                  items={items}
                  key={category.code}
                  oneHandMode={oneHandMode}
                  pendingIds={pendingIds}
                  queuedIds={queuedIds}
                  onCheckedChange={(entry, checked) => void setChecked(entry, checked)}
                />
              ))}
            </div>
          )}

          <ManualShoppingExtrasSection
            key={state.value.revisionId}
            revisionId={state.value.revisionId}
          />
        </>
      ) : null}
    </AppPageShell>
  )
}
