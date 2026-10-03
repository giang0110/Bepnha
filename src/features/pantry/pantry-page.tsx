import { pantryQuantityIsWhole } from "./whole-unit-quantity"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router"

import { loadHousehold } from "@/application/household/load-household"
import type { HouseholdRepository } from "@/application/household/household-repository"
import type {
  PantryFoodOption,
  PantryFoodOptionsRepository
} from "@/application/pantry/pantry-food-options-repository"
import {
  PantryRepositoryError,
  type PantryItemRecord,
  type PantryRepository
} from "@/application/pantry/pantry-repository"
import { AppPageShell } from "@/app/components/app-page-shell"
import { Button } from "@/app/components/ui/button"
import { Icon } from "@/app/components/ui/icon"
import { toast } from "@/app/components/ui/toast"
import {
  PANTRY_STORAGE_ZONES,
  pantryStorageZone,
  storageZoneMetadata,
  type PantryStorageZone
} from "@/domain/pantry/pantry-zones"
import { findLeftoverMealSuggestions } from "@/domain/pantry/leftover-meal-matcher"

import { PantryQuantityPresets } from "./pantry-quantity-presets"
import { loadRecentPantryFoods, rememberRecentPantryFood } from "./recent-pantry-foods"

interface Props {
  readonly householdRepository: HouseholdRepository
  readonly pantryRepository: PantryRepository
  readonly foodOptionsRepository: PantryFoodOptionsRepository
}

type ViewState =
  | { readonly status: "loading" }
  | { readonly status: "missing_household" }
  | {
      readonly status: "ready"
      readonly householdId: string
      readonly items: readonly PantryItemRecord[]
      readonly options: readonly PantryFoodOption[]
    }
  | { readonly status: "error" }

const VI_COLLATOR = new Intl.Collator("vi", { sensitivity: "base" })
const QUANTITY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u

const QUICK_PRESETS: readonly { readonly label: string; readonly searchKeyword: string }[] =
  Object.freeze([
    { label: "Gạo", searchKeyword: "gạo" },
    { label: "Trứng gà", searchKeyword: "trứng" },
    { label: "Nước mắm", searchKeyword: "nước mắm" },
    { label: "Dầu ăn", searchKeyword: "dầu ăn" },
    { label: "Hành tím", searchKeyword: "hành tím" },
    { label: "Tỏi", searchKeyword: "tỏi" }
  ])

function optionName(option: PantryFoodOption | undefined, foodId: string): string {
  return option?.foodNameVi ?? `Thực phẩm ${foodId}`
}

function unitName(option: PantryFoodOption, unitId: string): string {
  const unit = option.units.find((candidate) => candidate.unitId === unitId)
  return unit === undefined ? "đơn vị" : `${unit.unitCode} — ${unit.unitNameVi}`
}

function validQuantity(value: string): string | null {
  const trimmed = value.trim()
  return QUANTITY_PATTERN.test(trimmed) ? trimmed : null
}

function sortItems(
  items: readonly PantryItemRecord[],
  options: readonly PantryFoodOption[]
): PantryItemRecord[] {
  const names = new Map(options.map((option) => [option.foodId, option.foodNameVi]))
  return [...items].sort((left, right) => {
    const byName = VI_COLLATOR.compare(
      names.get(left.foodId) ?? left.foodId,
      names.get(right.foodId) ?? right.foodId
    )
    return byName !== 0 ? byName : left.foodId.localeCompare(right.foodId)
  })
}

function PantryItemEditor({
  item,
  option,
  pending,
  onSave,
  onRemove
}: Readonly<{
  item: PantryItemRecord
  option: PantryFoodOption
  pending: boolean
  onSave: (item: PantryItemRecord, quantity: string, unitId: string) => void
  onRemove: (item: PantryItemRecord) => void
}>) {
  const [quantity, setQuantity] = useState(item.quantity)
  const [unitId, setUnitId] = useState(item.unitId)
  const foodName = optionName(option, item.foodId)
  const zone = pantryStorageZone(foodName)
  const meta = storageZoneMetadata(zone)
  const badgeClasses: Record<"herb" | "clay" | "broth", string> = {
    herb: "bg-herb-50 text-herb-700 border-herb-200",
    clay: "bg-clay-50 text-clay-700 border-clay-200",
    broth: "bg-broth-50 text-broth-700 border-broth-200"
  }

  return (
    <li
      className="rounded-3xl border border-edge bg-paper-raised p-4 shadow-soft"
      data-testid={`pantry-item-${item.pantryItemId}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-ink">{foodName}</h2>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClasses[meta.badgeColor]}`}
        >
          <Icon name={meta.iconName} className="size-3" />
          {meta.labelVi}
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-soft">{meta.freshnessHintVi}</p>
      <div className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
          <span>Số lượng {foodName}</span>
          <input
            aria-label={`Số lượng ${foodName}`}
            className="min-h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
            disabled={pending}
            inputMode="decimal"
            min="0"
            step="any"
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(event.currentTarget.value)}
          />
        </label>
        <PantryQuantityPresets
          label={`Chọn nhanh số lượng ${foodName}`}
          unit={option.units.find((unit) => unit.unitId === unitId)}
          quantity={quantity}
          disabled={pending}
          onSelect={setQuantity}
        />
        <label className="grid gap-1 text-sm font-medium">
          <span>Đơn vị {foodName}</span>
          <select
            aria-label={`Đơn vị ${foodName}`}
            className="min-h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
            disabled={pending}
            value={unitId}
            onChange={(event) => setUnitId(event.currentTarget.value)}
          >
            {option.units.map((unit) => (
              <option key={unit.unitId} value={unit.unitId}>
                {unit.unitCode} — {unit.unitNameVi}
              </option>
            ))}
          </select>
        </label>
        {!pantryQuantityIsWhole(option, quantity, unitId, item.foodFactVersionId) ? (
          <p role="alert" className="text-sm text-chilli-700">
            Thực phẩm này phải nhập nguyên đơn vị. Giữ đúng lượng thực tế, ví dụ 3 trứng thay vì
            2,4.
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button
            disabled={
              pending ||
              validQuantity(quantity) === null ||
              !pantryQuantityIsWhole(option, quantity, unitId, item.foodFactVersionId)
            }
            type="button"
            onClick={() => {
              const normalized = validQuantity(quantity)
              if (
                normalized !== null &&
                pantryQuantityIsWhole(option, normalized, unitId, item.foodFactVersionId)
              )
                onSave(item, normalized, unitId)
            }}
          >
            Lưu {foodName}
          </Button>
          <Button disabled={pending} type="button" variant="outline" onClick={() => onRemove(item)}>
            Xóa {foodName}
          </Button>
        </div>
        <p className="text-xs text-ink-soft">
          Đang lưu theo {unitName(option, unitId)}. Bếp Nhà không tự trừ tủ bếp khi bạn đánh dấu đã
          mua.
        </p>
      </div>
    </li>
  )
}

export function PantryPage({
  householdRepository,
  pantryRepository,
  foodOptionsRepository
}: Props) {
  const [state, setState] = useState<ViewState>({ status: "loading" })
  const [selectedFoodId, setSelectedFoodId] = useState("")
  const [selectedUnitId, setSelectedUnitId] = useState("")
  const [newQuantity, setNewQuantity] = useState("0")
  const [searchQuery, setSearchQuery] = useState("")
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedZone, setSelectedZone] = useState<PantryStorageZone | "all">("all")
  const [leftoverFilterOnlyReady, setLeftoverFilterOnlyReady] = useState(false)
  const [recentFoodIds, setRecentFoodIds] = useState<readonly string[]>([])
  const activeHouseholdId = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    activeHouseholdId.current = null

    async function load() {
      const householdResult = await loadHousehold(householdRepository)
      if (!active) return
      if (!householdResult.ok) {
        setState({ status: "error" })
        return
      }
      if (householdResult.household === null) {
        setState({ status: "missing_household" })
        return
      }

      try {
        const [items, options] = await Promise.all([
          pantryRepository.load(householdResult.household.householdId),
          foodOptionsRepository.load()
        ])
        if (!active) return
        activeHouseholdId.current = householdResult.household.householdId
        setRecentFoodIds(loadRecentPantryFoods(householdResult.household.householdId))
        setState({
          status: "ready",
          householdId: householdResult.household.householdId,
          items: sortItems(items, options),
          options
        })
      } catch {
        if (active) setState({ status: "error" })
      }
    }

    void load()
    return () => {
      active = false
      activeHouseholdId.current = null
    }
  }, [foodOptionsRepository, householdRepository, pantryRepository, reloadToken])

  const selectedOption = useMemo(
    () =>
      state.status === "ready"
        ? state.options.find((option) => option.foodId === selectedFoodId)
        : undefined,
    [selectedFoodId, state]
  )

  const availableOptions = useMemo(() => {
    if (state.status !== "ready") return []
    const existingFoodIds = new Set(state.items.map((item) => item.foodId))
    const query = searchQuery
      .trim()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[đĐ]/gu, "d")
      .toLowerCase()
    return state.options.filter((option) => {
      if (existingFoodIds.has(option.foodId)) return false
      if (query === "") return true
      const name = option.foodNameVi
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[đĐ]/gu, "d")
        .toLowerCase()
      return name.includes(query)
    })
  }, [searchQuery, state])

  const recentOptions = useMemo(() => {
    if (state.status !== "ready") return []
    const existingFoodIds = new Set(state.items.map((item) => item.foodId))
    return recentFoodIds.flatMap((foodId) => {
      const option = state.options.find((candidate) => candidate.foodId === foodId)
      return option === undefined || existingFoodIds.has(foodId) ? [] : [option]
    })
  }, [recentFoodIds, state])

  function rememberSavedFood(householdId: string, foodId: string) {
    // A late save must not recreate history purged while the user was signing out.
    if (activeHouseholdId.current !== householdId) return
    rememberRecentPantryFood(householdId, foodId)
    setRecentFoodIds(loadRecentPantryFoods(householdId))
  }

  function applyQuickPreset(keyword: string) {
    if (state.status !== "ready") return
    const normalizedKeyword = keyword
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[đĐ]/gu, "d")
      .toLowerCase()
    const matched = availableOptions.find((option) => {
      const norm = option.foodNameVi
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[đĐ]/gu, "d")
        .toLowerCase()
      return norm.includes(normalizedKeyword)
    })
    if (matched !== undefined) {
      setSelectedFoodId(matched.foodId)
      setSelectedUnitId(matched.units[0]?.unitId ?? "")
      setNewQuantity("1")
    }
  }

  const availableFoodNames = useMemo(() => {
    if (state.status !== "ready") return []
    return state.items
      .filter((item) => {
        const q = parseFloat(item.quantity)
        return !isNaN(q) && q > 0
      })
      .map((item) =>
        optionName(
          state.options.find((o) => o.foodId === item.foodId),
          item.foodId
        )
      )
  }, [state])

  const leftoverSuggestions = useMemo(
    () => findLeftoverMealSuggestions(availableFoodNames),
    [availableFoodNames]
  )

  const displayedSuggestions = useMemo(() => {
    if (!leftoverFilterOnlyReady) return leftoverSuggestions
    return leftoverSuggestions.filter((s) => s.status === "ready_to_cook")
  }, [leftoverFilterOnlyReady, leftoverSuggestions])

  const displayedItems = useMemo(() => {
    if (state.status !== "ready") return []
    if (selectedZone === "all") return state.items
    return state.items.filter((item) => {
      const opt = state.options.find((o) => o.foodId === item.foodId)
      const name = opt?.foodNameVi ?? ""
      return pantryStorageZone(name) === selectedZone
    })
  }, [selectedZone, state])

  async function reloadAfterConflict(householdId: string, options: readonly PantryFoodOption[]) {
    try {
      const items = await pantryRepository.load(householdId)
      setState({ status: "ready", householdId, items: sortItems(items, options), options })
      setMessage("Tủ bếp đã thay đổi ở phiên khác nên Bếp Nhà đã tải lại dữ liệu mới nhất.")
    } catch {
      setState({ status: "error" })
    }
  }

  async function saveExisting(item: PantryItemRecord, quantity: string, unitId: string) {
    if (state.status !== "ready" || pendingKey !== null) return
    const option = state.options.find((candidate) => candidate.foodId === item.foodId)
    if (option === undefined) {
      setMessage("Không thể xác định dữ liệu thực phẩm hiện tại. Vui lòng tải lại.")
      return
    }

    setPendingKey(item.pantryItemId)
    setMessage(null)
    try {
      const saved = await pantryRepository.upsert({
        householdId: state.householdId,
        foodId: item.foodId,
        foodFactVersionId: option.foodFactVersionId,
        unitId,
        quantity,
        expectedVersion: item.version
      })
      rememberSavedFood(state.householdId, saved.foodId)
      setState({
        ...state,
        items: sortItems(
          state.items.map((entry) => (entry.pantryItemId === saved.pantryItemId ? saved : entry)),
          state.options
        )
      })
      toast.success("Đã cập nhật thực phẩm trong tủ bếp!")
    } catch (error: unknown) {
      if (error instanceof PantryRepositoryError && error.code === "VERSION_CONFLICT") {
        await reloadAfterConflict(state.householdId, state.options)
      } else {
        setMessage("Không thể cập nhật tủ bếp lúc này. Vui lòng thử lại.")
      }
    } finally {
      setPendingKey(null)
    }
  }

  async function removeExisting(item: PantryItemRecord) {
    if (state.status !== "ready" || pendingKey !== null) return
    setPendingKey(item.pantryItemId)
    setMessage(null)
    try {
      await pantryRepository.remove(item.pantryItemId, item.version)
      setState({
        ...state,
        items: state.items.filter((entry) => entry.pantryItemId !== item.pantryItemId)
      })
      toast.info("Đã xoá thực phẩm khỏi tủ bếp.")
    } catch (error: unknown) {
      if (error instanceof PantryRepositoryError && error.code === "VERSION_CONFLICT") {
        await reloadAfterConflict(state.householdId, state.options)
      } else {
        setMessage("Không thể xóa thực phẩm khỏi tủ bếp lúc này. Vui lòng thử lại.")
      }
    } finally {
      setPendingKey(null)
    }
  }

  async function addItem() {
    if (
      state.status !== "ready" ||
      selectedOption === undefined ||
      selectedUnitId === "" ||
      pendingKey !== null
    )
      return
    const quantity = validQuantity(newQuantity)
    if (quantity === null || !pantryQuantityIsWhole(selectedOption, quantity, selectedUnitId))
      return

    setPendingKey("new")
    setMessage(null)
    try {
      const saved = await pantryRepository.upsert({
        householdId: state.householdId,
        foodId: selectedOption.foodId,
        foodFactVersionId: selectedOption.foodFactVersionId,
        unitId: selectedUnitId,
        quantity,
        expectedVersion: 0
      })
      rememberSavedFood(state.householdId, saved.foodId)
      setState({ ...state, items: sortItems([...state.items, saved], state.options) })
      toast.success("Đã thêm thực phẩm vào tủ bếp!")
      setSelectedFoodId("")
      setSelectedUnitId("")
      setNewQuantity("0")
      setSearchQuery("")
    } catch (error: unknown) {
      if (error instanceof PantryRepositoryError && error.code === "VERSION_CONFLICT") {
        await reloadAfterConflict(state.householdId, state.options)
      } else {
        setMessage(
          error instanceof PantryRepositoryError &&
            error.code === "INVALID_INDIVISIBLE_PANTRY_QUANTITY"
            ? "Lượng thực phẩm phải là nguyên đơn vị. Kiểm tra lại số lượng và đơn vị đang chọn."
            : "Không thể thêm thực phẩm vào tủ bếp lúc này. Vui lòng thử lại."
        )
      }
    } finally {
      setPendingKey(null)
    }
  }

  if (state.status === "loading") {
    return (
      <AppPageShell className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6 text-ink sm:px-6 lg:px-8 lg:py-8">
        <p role="status">Đang tải tủ bếp…</p>
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
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Tủ bếp</h1>
        <p className="text-sm text-ink-soft">
          Ghi số lượng hiện có. Mỗi lần tạo hoặc đổi kế hoạch, Bếp Nhà lưu riêng ảnh chụp tủ bếp đã
          dùng để tính.
        </p>
        <Link className="text-sm font-medium text-herb-700 underline" to="/plan">
          Quay lại kế hoạch tuần
        </Link>
      </header>

      {state.status === "missing_household" ? (
        <p role="alert">Hãy hoàn tất thông tin gia đình trước khi quản lý tủ bếp.</p>
      ) : null}
      {state.status === "error" ? (
        <div className="grid justify-items-start gap-3" role="alert">
          <p>
            {typeof navigator !== "undefined" && !navigator.onLine
              ? "Không có kết nối mạng. Không thể tải tủ bếp lúc này."
              : "Không thể tải tủ bếp lúc này."}
          </p>
          {/* Saying "try again" without offering a way to do it leaves a browser reload as the
              only route, which is not an instruction so much as an apology. */}
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
      {message === null ? null : (
        <p className="rounded-2xl border border-broth-200 bg-broth-50 p-3 text-sm" role="alert">
          {message}
        </p>
      )}

      {state.status === "ready" ? (
        <>
          {state.items.length > 0 && (
            <nav
              aria-label="Khu vực lưu trữ tủ bếp"
              className="flex flex-wrap items-center gap-2 border-b border-edge pb-3"
            >
              <span className="mr-1 text-xs font-bold uppercase tracking-wider text-ink-soft">
                Ngăn lưu trữ:
              </span>
              {PANTRY_STORAGE_ZONES.map((zone) => {
                const isSelected = selectedZone === zone.id
                const count =
                  zone.id === "all"
                    ? state.items.length
                    : state.items.filter((item) => {
                        const opt = state.options.find((o) => o.foodId === item.foodId)
                        return pantryStorageZone(opt?.foodNameVi ?? "") === zone.id
                      }).length

                return (
                  <button
                    key={zone.id}
                    type="button"
                    aria-pressed={isSelected}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      isSelected
                        ? "bg-herb-700 text-white shadow-xs"
                        : "border border-edge bg-paper-raised text-ink-soft hover:bg-paper-sunken"
                    }`}
                    onClick={() => setSelectedZone(zone.id)}
                  >
                    {zone.shortLabelVi}
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                        isSelected ? "bg-herb-900/40 text-white" : "bg-paper-sunken text-ink"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </nav>
          )}

          {leftoverSuggestions.length > 0 && (
            <section
              className="rounded-3xl border border-herb-200 bg-herb-50/50 p-4 shadow-soft sm:p-5"
              aria-label="Nấu vét tủ chống lãng phí"
              data-testid="leftover-meal-suggestions"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-2xl bg-herb-600 text-white shadow-xs">
                    <Icon name="pan" className="size-4" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-ink">Nấu vét tủ chống lãng phí</h2>
                    <p className="text-xs text-ink-soft">
                      Món ăn Việt gợi ý nấu ngay từ nguyên liệu đang có sẵn trong tủ bếp
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                      !leftoverFilterOnlyReady
                        ? "bg-herb-700 text-white"
                        : "border border-edge bg-paper-raised text-ink-soft hover:bg-paper-sunken"
                    }`}
                    onClick={() => setLeftoverFilterOnlyReady(false)}
                  >
                    Tất cả gợi ý ({leftoverSuggestions.length})
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                      leftoverFilterOnlyReady
                        ? "bg-herb-700 text-white"
                        : "border border-edge bg-paper-raised text-ink-soft hover:bg-paper-sunken"
                    }`}
                    onClick={() => setLeftoverFilterOnlyReady(true)}
                  >
                    Nấu được ngay (
                    {leftoverSuggestions.filter((s) => s.status === "ready_to_cook").length})
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {displayedSuggestions.map((suggestion) => (
                  <article
                    key={suggestion.dishId}
                    className="flex flex-col justify-between rounded-2xl border border-edge bg-paper-raised p-3.5 shadow-xs"
                    data-testid={`leftover-dish-${suggestion.dishId}`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-ink sm:text-base">
                          {suggestion.dishNameVi}
                        </h3>
                        {suggestion.status === "ready_to_cook" ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-herb-100 px-2 py-0.5 text-xs font-bold text-herb-800">
                            <Icon name="check" className="size-3" />
                            Đủ đồ
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center rounded-full border border-broth-200 bg-broth-50 px-2 py-0.5 text-xs font-semibold text-broth-900">
                            Thiếu 1 món
                          </span>
                        )}
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1 text-xs">
                        {suggestion.matchedIngredients.map((ing) => (
                          <span
                            key={ing}
                            className="inline-flex items-center gap-0.5 rounded-lg bg-herb-50 px-2 py-0.5 font-medium text-herb-700"
                          >
                            ✓ {ing}
                          </span>
                        ))}
                        {suggestion.missingIngredients.map((ing) => (
                          <span
                            key={ing}
                            className="inline-flex items-center gap-0.5 rounded-lg bg-chilli-50 px-2 py-0.5 font-medium text-chilli-700"
                          >
                            + Thiếu {ing}
                          </span>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section
            className="rounded-2xl bg-paper-raised p-4 shadow-soft"
            aria-label="Thêm thực phẩm"
          >
            <h2 className="font-bold text-ink">Thêm thực phẩm</h2>
            <div className="mt-3 grid gap-3">
              {recentOptions.length > 0 ? (
                <div role="group" aria-label="Thực phẩm gần đây" className="grid gap-2">
                  <h3 className="text-sm font-semibold text-ink">Đã dùng gần đây</h3>
                  <p className="text-xs text-ink-soft">Chỉ lưu trên thiết bị này.</p>
                  <div className="flex flex-wrap gap-2">
                    {recentOptions.map((option) => (
                      <button
                        key={option.foodId}
                        type="button"
                        aria-label={`Chọn lại ${option.foodNameVi}`}
                        className="min-h-11 rounded-xl border border-edge bg-paper-sunken px-3 text-sm font-medium text-ink transition-colors hover:border-herb-500 hover:bg-herb-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-herb-600 disabled:opacity-50"
                        disabled={pendingKey !== null}
                        onClick={() => {
                          setSearchQuery("")
                          setSelectedFoodId(option.foodId)
                          setSelectedUnitId(option.units[0]?.unitId ?? "")
                          setNewQuantity("0")
                        }}
                      >
                        {option.foodNameVi}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <label className="grid gap-1 text-sm font-medium">
                <span>Tìm thực phẩm</span>
                <input
                  aria-label="Tìm thực phẩm"
                  className="min-h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
                  disabled={pendingKey !== null}
                  placeholder="Ví dụ: thịt, rau, gạo…"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                />
              </label>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-xs font-medium text-ink-soft">
                  Chọn nhanh gia vị & thực phẩm:
                </span>
                {QUICK_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="rounded-lg border border-edge bg-paper-sunken px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-herb-500 hover:bg-herb-50"
                    disabled={pendingKey !== null}
                    onClick={() => applyQuickPreset(preset.searchKeyword)}
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
              <label className="grid gap-1 text-sm font-medium">
                <span>Thực phẩm</span>
                <select
                  aria-label="Thực phẩm"
                  className="min-h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
                  disabled={pendingKey !== null}
                  value={selectedFoodId}
                  onChange={(event) => {
                    const foodId = event.currentTarget.value
                    const option = state.options.find((candidate) => candidate.foodId === foodId)
                    setSelectedFoodId(foodId)
                    setSelectedUnitId(option?.units[0]?.unitId ?? "")
                  }}
                >
                  <option value="">Chọn thực phẩm</option>
                  {availableOptions.map((option) => (
                    <option key={option.foodId} value={option.foodId}>
                      {option.foodNameVi}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                <span>Đơn vị</span>
                <select
                  aria-label="Đơn vị"
                  className="min-h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
                  disabled={pendingKey !== null || selectedOption === undefined}
                  value={selectedUnitId}
                  onChange={(event) => setSelectedUnitId(event.currentTarget.value)}
                >
                  <option value="">Chọn đơn vị</option>
                  {selectedOption?.units.map((unit) => (
                    <option key={unit.unitId} value={unit.unitId}>
                      {unit.unitCode} — {unit.unitNameVi}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                <span>Số lượng</span>
                <input
                  aria-label="Số lượng"
                  className="min-h-11 rounded-xl border border-edge-strong bg-paper-raised px-3.5 transition-colors focus:border-herb-500"
                  disabled={pendingKey !== null}
                  inputMode="decimal"
                  min="0"
                  step="any"
                  type="number"
                  value={newQuantity}
                  onChange={(event) => setNewQuantity(event.currentTarget.value)}
                />
              </label>
              <PantryQuantityPresets
                unit={selectedOption?.units.find((unit) => unit.unitId === selectedUnitId)}
                quantity={newQuantity}
                disabled={pendingKey !== null}
                onSelect={setNewQuantity}
              />
              {selectedOption &&
              !pantryQuantityIsWhole(selectedOption, newQuantity, selectedUnitId) ? (
                <p role="alert" className="text-sm text-chilli-700">
                  Thực phẩm này phải nhập nguyên đơn vị; ví dụ 3 trứng thay vì 2,4.
                </p>
              ) : null}
              <Button
                disabled={
                  pendingKey !== null ||
                  selectedOption === undefined ||
                  selectedUnitId === "" ||
                  validQuantity(newQuantity) === null ||
                  !pantryQuantityIsWhole(selectedOption, newQuantity, selectedUnitId)
                }
                type="button"
                onClick={() => void addItem()}
              >
                Thêm vào tủ bếp
              </Button>
            </div>
          </section>

          {state.items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-edge-strong bg-paper-raised p-4 text-sm text-ink-soft">
              Tủ bếp đang trống. Thêm lượng thực phẩm đang có để danh sách đi chợ trừ đúng trước khi
              làm tròn gói mua.
            </p>
          ) : displayedItems.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-edge-strong bg-paper-raised p-4 text-sm text-ink-soft">
              Không có thực phẩm nào trong ngăn lưu trữ này.
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2" aria-label="Thực phẩm đang có">
              {displayedItems.map((item) => {
                const option = state.options.find((candidate) => candidate.foodId === item.foodId)
                if (option === undefined) return null
                return (
                  <PantryItemEditor
                    item={item}
                    key={`${item.pantryItemId}:${item.version}`}
                    option={option}
                    pending={pendingKey === item.pantryItemId}
                    onRemove={(entry) => void removeExisting(entry)}
                    onSave={(entry, quantity, unitId) => void saveExisting(entry, quantity, unitId)}
                  />
                )
              })}
            </ul>
          )}
        </>
      ) : null}
    </AppPageShell>
  )
}
