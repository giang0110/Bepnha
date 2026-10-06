import { useState } from "react"

import { Button } from "@/app/components/ui/button"
import { Icon } from "@/app/components/ui/icon"
import type { CookingPantryDeductionResultItem } from "@/domain/pantry/pantry-cooking-deduction"

export interface PantryCookingDeductionModalProps {
  readonly items: readonly CookingPantryDeductionResultItem[]
  readonly isOpen: boolean
  readonly isSubmitting: boolean
  readonly errorMessage: string | null
  readonly onConfirm: (selectedItems: readonly CookingPantryDeductionResultItem[]) => void
  readonly onSkip: () => void
}

function formatViQuantity(value: string): string {
  const num = Number(value)
  if (Number.isFinite(num)) {
    return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 6 }).format(num)
  }
  return value
}

export function PantryCookingDeductionModal({
  items,
  isOpen,
  isSubmitting,
  errorMessage,
  onConfirm,
  onSkip
}: PantryCookingDeductionModalProps) {
  const [deselectedIds, setDeselectedIds] = useState<ReadonlySet<string>>(new Set())

  if (!isOpen) return null

  const selectedItems = items.filter((i) => !deselectedIds.has(i.pantryItemId))
  const selectedCount = selectedItems.length

  const toggleItem = (id: string) => {
    setDeselectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => setDeselectedIds(new Set())
  const deselectAll = () => setDeselectedIds(new Set(items.map((i) => i.pantryItemId)))

  return (
    <dialog
      className="fixed inset-x-4 top-auto bottom-[calc(var(--app-nav-height)+0.75rem)] m-0 mx-auto max-h-[calc(100svh-var(--app-nav-height)-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-herb-200 bg-paper-raised p-5 text-ink shadow-lift backdrop:bg-black/30 backdrop:backdrop-blur-xs sm:p-6 lg:left-auto lg:right-8 lg:mx-0 lg:w-[min(42rem,calc(100vw-19rem))]"
      open
      aria-label="Xác nhận trừ kho tủ bếp sau khi nấu"
      aria-modal="true"
      onCancel={(e) => {
        e.preventDefault()
        if (!isSubmitting) onSkip()
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-edge pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon name="bowl" className="size-5 text-herb-700" />
            <h2 className="text-lg font-bold text-ink">Bữa cơm đã hoàn thành!</h2>
          </div>
          <p className="mt-1 text-xs text-ink-soft sm:text-sm">
            Đối chiếu và trừ các nguyên liệu đã dùng khỏi Tủ bếp gia đình
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-herb-100 px-3 py-1 text-xs font-bold text-herb-900 tabular-nums dark:bg-herb-950 dark:text-herb-200">
          Chọn {selectedCount}/{items.length}
        </span>
      </div>

      {errorMessage !== null && (
        <div
          role="alert"
          className="mt-3 rounded-2xl border border-chilli-200 bg-chilli-50/70 p-3 text-xs font-medium text-chilli-900 dark:border-chilli-900/40 dark:bg-chilli-950/30 dark:text-chilli-200"
        >
          {errorMessage}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-ink-soft">
          Đánh dấu nguyên liệu muốn cập nhật trong tủ bếp:
        </span>
        <div className="flex gap-2">
          {selectedCount < items.length ? (
            <button
              type="button"
              onClick={selectAll}
              disabled={isSubmitting}
              className="font-bold text-herb-700 hover:underline dark:text-herb-400"
            >
              Chọn tất cả
            </button>
          ) : (
            <button
              type="button"
              onClick={deselectAll}
              disabled={isSubmitting}
              className="font-bold text-ink-soft hover:underline"
            >
              Bỏ chọn tất cả
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2.5">
        {items.map((item) => {
          const isSelected = !deselectedIds.has(item.pantryItemId)
          return (
            <label
              key={item.pantryItemId}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${
                isSelected
                  ? "border-herb-300 bg-herb-50/50 dark:border-herb-800 dark:bg-herb-950/20"
                  : "border-edge bg-paper-sunken/40 text-ink-soft hover:bg-paper-sunken"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={isSubmitting}
                onChange={() => toggleItem(item.pantryItemId)}
                className="mt-1 size-4 rounded accent-herb-600 focus:ring-herb-500"
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-ink">{item.foodNameVi}</span>
                  {item.action === "remove" ? (
                    <span className="rounded-full border border-clay-300 bg-clay-50 px-2.5 py-0.5 text-xs font-semibold text-clay-800 dark:border-clay-800 dark:bg-clay-950/40 dark:text-clay-300">
                      Dùng hết · Xoá khỏi tủ
                    </span>
                  ) : (
                    <span className="rounded-full border border-herb-300 bg-herb-50 px-2.5 py-0.5 text-xs font-semibold text-herb-800 dark:border-herb-800 dark:bg-herb-950/40 dark:text-herb-300">
                      Còn {formatViQuantity(item.remainingQuantity)} {item.unitNameVi}
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
                  <span>
                    Hiện có:{" "}
                    <strong className="text-ink">
                      {formatViQuantity(item.currentQuantity)} {item.unitNameVi}
                    </strong>
                  </span>
                  <span>
                    Nấu bữa này:{" "}
                    <strong className="text-herb-800 dark:text-herb-300">
                      -{formatViQuantity(item.usedQuantity)} {item.unitNameVi}
                    </strong>
                  </span>
                  <span>
                    Sau khi trừ:{" "}
                    <strong className="text-ink">
                      {item.action === "remove"
                        ? "0 (Hết)"
                        : `${formatViQuantity(item.remainingQuantity)} ${item.unitNameVi}`}
                    </strong>
                  </span>
                </div>
              </div>
            </label>
          )
        })}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={onSkip}
          className="rounded-full"
        >
          Bỏ qua (về kế hoạch)
        </Button>
        <Button
          type="button"
          disabled={isSubmitting || selectedCount === 0}
          onClick={() => onConfirm(selectedItems)}
          className="flex items-center justify-center gap-2 rounded-full"
        >
          {isSubmitting ? (
            <span>Đang trừ kho…</span>
          ) : (
            <>
              <Icon name="check" className="size-4" />
              <span>Xác nhận trừ kho ({selectedCount})</span>
            </>
          )}
        </Button>
      </div>
    </dialog>
  )
}
