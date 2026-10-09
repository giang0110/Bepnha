import { useState } from "react"
import { Button } from "@/app/components/ui/button"
import { Icon } from "@/app/components/ui/icon"

export interface EatOutModalProps {
  readonly isOpen: boolean
  readonly dayIndex: number
  readonly dayLabelVi: string
  readonly mealOptionNameVi: string
  readonly initialReason?: string | undefined
  readonly onConfirm: (reason: string) => void
  readonly onClose: () => void
}

const PRESET_REASONS = [
  "Ăn tiệc / Liên hoan",
  "Về quê thăm gia đình",
  "Ăn ngoài đổi gió",
  "Bận việc đột xuất",
  "Đi du lịch cuối tuần"
] as const

export function EatOutModal({
  isOpen,
  dayLabelVi,
  mealOptionNameVi,
  initialReason = "",
  onConfirm,
  onClose
}: Readonly<EatOutModalProps>) {
  const [reason, setReason] = useState(initialReason)

  if (!isOpen) return null

  const handleSelectPreset = (preset: string) => {
    setReason(preset)
  }

  const handleConfirm = () => {
    onConfirm(reason.trim())
  }

  return (
    <div
      aria-label={`Đánh dấu ăn ngoài ${dayLabelVi}`}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs"
      role="dialog"
      data-testid="eat-out-modal"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-edge bg-paper-raised p-5 shadow-lift sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-edge/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
              <span className="text-xl">🍜</span>
            </div>
            <div>
              <h3 className="text-base font-extrabold text-ink">
                Đánh dấu ăn ngoài · {dayLabelVi}
              </h3>
              <p className="text-xs text-ink-soft truncate max-w-[220px]">{mealOptionNameVi}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng"
            className="rounded-full p-1.5 text-ink-soft hover:bg-paper-sunken hover:text-ink transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Info */}
        <p className="text-xs leading-relaxed text-ink-soft">
          Khi đánh dấu ăn ngoài, ngày này sẽ được bỏ qua trong danh sách việc rã đông/chuẩn bị và
          thời gian nấu nướng của tuần.
        </p>

        {/* Preset Chips */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-ink">Gợi ý lý do nhanh:</label>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_REASONS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                data-testid={`eat-out-reason-chip-${preset}`}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                  reason === preset
                    ? "bg-amber-200 text-amber-950 font-bold"
                    : "border border-edge bg-paper text-ink-soft hover:border-amber-300 hover:text-ink"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Reason Input */}
        <div className="space-y-1.5">
          <label htmlFor="eat-out-reason-input" className="text-xs font-bold text-ink">
            Ghi chú (tùy chọn):
          </label>
          <input
            id="eat-out-reason-input"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ví dụ: Đi ăn cỗ cưới, Sinh nhật bạn..."
            maxLength={100}
            className="w-full rounded-2xl border border-edge bg-paper px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-amber-500 focus:outline-hidden"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-edge/60">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Hủy bỏ
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            data-testid="confirm-eat-out-btn"
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            <Icon name="check" className="size-3.5" />
            <span>Xác nhận ăn ngoài</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
