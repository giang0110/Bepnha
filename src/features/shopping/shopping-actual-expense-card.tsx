import { useState } from "react"
import { Icon } from "@/app/components/ui/icon"
import {
  calculateBudgetVariance,
  validateActualExpenseAmount
} from "@/domain/shopping/shopping-actual-expense"
import type { StoredActualExpense } from "./shopping-actual-expense-store"

export interface ShoppingActualExpenseCardProps {
  readonly estimatedCostVnd: number
  readonly budgetVnd: number
  readonly pickedUpCostVnd: number
  readonly actualExpense: StoredActualExpense | null
  readonly onSaveActualExpense: (amountVnd: number, note?: string) => void
  readonly onClearActualExpense: () => void
}

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)
}

export function ShoppingActualExpenseCard({
  estimatedCostVnd,
  budgetVnd,
  pickedUpCostVnd,
  actualExpense,
  onSaveActualExpense,
  onClearActualExpense
}: Readonly<ShoppingActualExpenseCardProps>) {
  const [isEditing, setIsEditing] = useState(false)
  const [inputAmount, setInputAmount] = useState<string>(
    actualExpense ? String(actualExpense.actualCostVnd) : ""
  )
  const [note, setNote] = useState<string>(actualExpense?.note ?? "")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleOpenForm = () => {
    setInputAmount(
      actualExpense
        ? String(actualExpense.actualCostVnd)
        : pickedUpCostVnd > 0
          ? String(pickedUpCostVnd)
          : String(estimatedCostVnd)
    )
    setNote(actualExpense?.note ?? "")
    setErrorMessage(null)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setErrorMessage(null)
  }

  const handleSave = () => {
    const parsed = parseInt(inputAmount.trim(), 10)
    const validation = validateActualExpenseAmount(parsed)
    if (!validation.valid) {
      setErrorMessage(validation.reason)
      return
    }

    onSaveActualExpense(parsed, note.trim() || undefined)
    setIsEditing(false)
    setErrorMessage(null)
  }

  // 1. If we have a recorded actual expense and not editing
  if (actualExpense !== null && !isEditing) {
    const variance = calculateBudgetVariance(
      estimatedCostVnd,
      actualExpense.actualCostVnd,
      budgetVnd
    )

    const badgeColors =
      variance.status === "saved"
        ? "bg-herb-100 text-herb-900 border-herb-200"
        : variance.status === "over_estimated"
          ? "bg-clay-100 text-clay-900 border-clay-200"
          : "bg-paper-sunken text-ink border-edge"

    return (
      <div
        className="rounded-2xl border border-edge bg-paper-raised p-3.5 shadow-soft sm:p-4"
        data-testid="actual-expense-summary"
      >
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-herb-100 text-herb-700">
              <Icon name="check" className="size-4" />
            </span>
            <div>
              <p className="text-xs font-semibold text-ink-soft">Thực chi thanh toán</p>
              <p className="text-base font-extrabold text-ink tabular-nums sm:text-lg">
                {formatVnd(actualExpense.actualCostVnd)} đ
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" data-print="hide">
            <button
              type="button"
              onClick={handleOpenForm}
              data-testid="edit-actual-expense-btn"
              className="rounded-xl border border-edge bg-paper-sunken px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:border-herb-500 hover:bg-paper"
            >
              Sửa
            </button>
            <button
              type="button"
              onClick={onClearActualExpense}
              data-testid="clear-actual-expense-btn"
              className="rounded-xl border border-edge bg-paper-sunken px-2.5 py-1 text-xs font-semibold text-chilli-700 transition-colors hover:border-chilli-300 hover:bg-chilli-50"
            >
              Xóa
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${badgeColors}`}
          >
            {variance.status === "saved"
              ? "🎉 "
              : variance.status === "over_estimated"
                ? "⚠️ "
                : "✓ "}
            {variance.labelVi}
          </span>
          <span className="text-xs text-ink-soft">(Dự toán: {formatVnd(estimatedCostVnd)} đ)</span>
        </div>

        {budgetVnd > 0 && (
          <p className="mt-2 text-xs text-ink-soft">
            📊 Sử dụng <strong>{variance.budgetUtilizationPercent}%</strong> ngân sách tuần (Còn{" "}
            <strong className="text-ink">{formatVnd(variance.budgetRemainingVnd)} đ</strong>).
          </p>
        )}

        {actualExpense.note && (
          <p className="mt-2 text-xs italic text-ink-soft">Ghi chú: {actualExpense.note}</p>
        )}
      </div>
    )
  }

  // 2. If editing form is open
  if (isEditing) {
    return (
      <div
        className="rounded-2xl border border-edge bg-paper-raised p-4 shadow-soft"
        data-testid="actual-expense-form"
      >
        <div className="flex items-center justify-between gap-2 border-b border-edge/60 pb-2.5">
          <h3 className="text-sm font-bold text-ink">Ghi nhận số tiền thanh toán thực tế</h3>
          <button
            type="button"
            onClick={handleCancel}
            data-testid="cancel-actual-expense-btn"
            className="text-xs font-semibold text-ink-soft hover:text-ink"
          >
            ✕ Hủy
          </button>
        </div>

        <div className="mt-3 grid gap-3">
          <label className="grid gap-1 text-xs font-medium">
            <span>Số tiền thực tế đã trả (VND)</span>
            <input
              type="number"
              step="1000"
              min="0"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              placeholder="Ví dụ: 650000"
              data-testid="actual-expense-input"
              className="w-full rounded-xl border border-edge-strong bg-paper px-3 py-2 text-sm font-bold text-ink focus:border-herb-500 focus:outline-none"
            />
          </label>

          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-ink-soft">Điền nhanh:</span>
            {pickedUpCostVnd > 0 && (
              <button
                type="button"
                onClick={() => setInputAmount(String(pickedUpCostVnd))}
                className="rounded-lg border border-edge bg-paper-sunken px-2 py-1 font-semibold text-herb-800 transition-colors hover:bg-herb-50"
              >
                Đã nhặt: {formatVnd(pickedUpCostVnd)} đ
              </button>
            )}
            <button
              type="button"
              onClick={() => setInputAmount(String(estimatedCostVnd))}
              className="rounded-lg border border-edge bg-paper-sunken px-2 py-1 font-semibold text-ink transition-colors hover:bg-paper"
            >
              Dự toán: {formatVnd(estimatedCostVnd)} đ
            </button>
          </div>

          <label className="grid gap-1 text-xs font-medium">
            <span>Ghi chú chuyến đi chợ (tùy chọn)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: mua thêm bắp cải, chợ Hôm giảm giá..."
              data-testid="actual-expense-note-input"
              className="w-full rounded-xl border border-edge bg-paper px-3 py-1.5 text-xs text-ink focus:border-herb-500 focus:outline-none"
            />
          </label>

          {errorMessage && (
            <p role="alert" className="text-xs font-semibold text-chilli-700">
              {errorMessage}
            </p>
          )}

          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              data-testid="save-actual-expense-btn"
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-herb-600 px-4 text-xs font-bold text-white transition-colors hover:bg-herb-700"
            >
              Lưu chi tiêu
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-edge bg-paper-sunken px-3.5 text-xs font-semibold text-ink-soft hover:bg-paper"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 3. Default state: compact button to open form
  return (
    <div className="pt-1 pb-1" data-print="hide">
      <button
        type="button"
        onClick={handleOpenForm}
        data-testid="open-actual-expense-btn"
        className="inline-flex w-full items-center justify-between rounded-2xl border border-edge border-dashed bg-paper-raised/60 p-3 text-left transition-colors hover:border-herb-500 hover:bg-paper-raised"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-paper-sunken text-herb-700">
            💵
          </span>
          <div>
            <p className="text-xs font-bold text-ink">Ghi nhận thanh toán thực tế</p>
            <p className="text-[11px] text-ink-soft">
              Đối soát tiền thực chi với dự toán và ngân sách tuần
            </p>
          </div>
        </div>
        <span className="text-xs font-bold text-herb-700">+ Nhập số tiền</span>
      </button>
    </div>
  )
}
