import { useEffect, useMemo, useState } from "react"
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
import { Button } from "@/app/components/ui/button"

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
    const byName = VI_COLLATOR.compare(names.get(left.foodId) ?? left.foodId, names.get(right.foodId) ?? right.foodId)
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

  return (
    <li
      className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
      data-testid={`pantry-item-${item.pantryItemId}`}
    >
      <h2 className="font-semibold">{foodName}</h2>
      <p className="mt-1 text-xs text-slate-500">Phiên bản dữ liệu thực phẩm {item.foodFactVersionId}</p>
      <div className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
          <span>Số lượng {foodName}</span>
          <input
            aria-label={`Số lượng ${foodName}`}
            className="min-h-11 rounded-lg border border-stone-300 bg-white px-3"
            disabled={pending}
            inputMode="decimal"
            min="0"
            step="any"
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(event.currentTarget.value)}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          <span>Đơn vị {foodName}</span>
          <select
            aria-label={`Đơn vị ${foodName}`}
            className="min-h-11 rounded-lg border border-stone-300 bg-white px-3"
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
        <div className="flex gap-2">
          <Button
            disabled={pending || validQuantity(quantity) === null}
            type="button"
            onClick={() => {
              const normalized = validQuantity(quantity)
              if (normalized !== null) onSave(item, normalized, unitId)
            }}
          >
            Lưu {foodName}
          </Button>
          <Button disabled={pending} type="button" variant="outline" onClick={() => onRemove(item)}>
            Xóa {foodName}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Đang lưu theo {unitName(option, unitId)}. Bếp Nhà không tự trừ tủ bếp khi bạn đánh dấu đã mua.
        </p>
      </div>
    </li>
  )
}

export function PantryPage({ householdRepository, pantryRepository, foodOptionsRepository }: Props) {
  const [state, setState] = useState<ViewState>({ status: "loading" })
  const [selectedFoodId, setSelectedFoodId] = useState("")
  const [selectedUnitId, setSelectedUnitId] = useState("")
  const [newQuantity, setNewQuantity] = useState("0")
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true

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
    }
  }, [foodOptionsRepository, householdRepository, pantryRepository])

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
    return state.options.filter((option) => !existingFoodIds.has(option.foodId))
  }, [state])

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
      setState({ ...state, items: sortItems(state.items.map((entry) => (entry.pantryItemId === saved.pantryItemId ? saved : entry)), state.options) })
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
    if (quantity === null) return

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
      setState({ ...state, items: sortItems([...state.items, saved], state.options) })
      setSelectedFoodId("")
      setSelectedUnitId("")
      setNewQuantity("0")
    } catch (error: unknown) {
      if (error instanceof PantryRepositoryError && error.code === "VERSION_CONFLICT") {
        await reloadAfterConflict(state.householdId, state.options)
      } else {
        setMessage("Không thể thêm thực phẩm vào tủ bếp lúc này. Vui lòng thử lại.")
      }
    } finally {
      setPendingKey(null)
    }
  }

  if (state.status === "loading") return <p role="status">Đang tải tủ bếp…</p>

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 bg-stone-50 px-4 py-6 text-slate-950">
      <header className="grid gap-2">
        <p className="text-sm font-medium text-emerald-700">Bếp Nhà</p>
        <h1 className="text-2xl font-semibold">Tủ bếp</h1>
        <p className="text-sm text-slate-600">
          Ghi số lượng hiện có. Mỗi lần tạo hoặc đổi kế hoạch, Bếp Nhà lưu riêng ảnh chụp tủ bếp đã dùng để tính.
        </p>
        <Link className="text-sm font-medium text-emerald-800 underline" to="/plan">
          Quay lại kế hoạch tuần
        </Link>
      </header>

      {state.status === "missing_household" ? (
        <p role="alert">Hãy hoàn tất thông tin gia đình trước khi quản lý tủ bếp.</p>
      ) : null}
      {state.status === "error" ? <p role="alert">Không thể tải tủ bếp lúc này. Vui lòng thử lại.</p> : null}
      {message === null ? null : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm" role="alert">
          {message}
        </p>
      )}

      {state.status === "ready" ? (
        <>
          <section className="rounded-xl bg-white p-4 shadow-sm" aria-label="Thêm thực phẩm">
            <h2 className="font-semibold">Thêm thực phẩm</h2>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1 text-sm font-medium">
                <span>Thực phẩm</span>
                <select
                  aria-label="Thực phẩm"
                  className="min-h-11 rounded-lg border border-stone-300 bg-white px-3"
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
                  className="min-h-11 rounded-lg border border-stone-300 bg-white px-3"
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
                  className="min-h-11 rounded-lg border border-stone-300 bg-white px-3"
                  disabled={pendingKey !== null}
                  inputMode="decimal"
                  min="0"
                  step="any"
                  type="number"
                  value={newQuantity}
                  onChange={(event) => setNewQuantity(event.currentTarget.value)}
                />
              </label>
              <Button
                disabled={
                  pendingKey !== null ||
                  selectedOption === undefined ||
                  selectedUnitId === "" ||
                  validQuantity(newQuantity) === null
                }
                type="button"
                onClick={() => void addItem()}
              >
                Thêm vào tủ bếp
              </Button>
            </div>
          </section>

          {state.items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-300 bg-white p-4 text-sm text-slate-600">
              Tủ bếp đang trống. Thêm lượng thực phẩm đang có để danh sách đi chợ trừ đúng trước khi làm tròn gói mua.
            </p>
          ) : (
            <ul className="grid gap-3" aria-label="Thực phẩm đang có">
              {state.items.map((item) => {
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
    </main>
  )
}
