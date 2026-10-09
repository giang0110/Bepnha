import { memo, useMemo, useState } from "react"
import { Icon } from "@/app/components/ui/icon"
import {
  analyzeMealLeftoverStorage,
  type StorageSafetyTier
} from "@/domain/recipe/leftover-storage-guide"

export interface LeftoverStorageGuideCardProps {
  readonly dishes: readonly { readonly name: string; readonly role?: string | undefined }[]
  readonly title?: string | undefined
  readonly defaultExpanded?: boolean | undefined
}

function tierBadgeClass(tier: StorageSafetyTier): string {
  switch (tier) {
    case "do_not_keep_overnight":
      return "bg-chilli-100 text-chilli-900 border-chilli-200"
    case "keep_max_24h":
      return "bg-amber-100 text-amber-900 border-amber-200"
    case "keep_2_to_3_days":
      return "bg-herb-100 text-herb-900 border-herb-200"
  }
}

function tierBadgeIcon(tier: StorageSafetyTier): string {
  switch (tier) {
    case "do_not_keep_overnight":
      return "⚠️"
    case "keep_max_24h":
      return "⏱️"
    case "keep_2_to_3_days":
      return "❄️"
  }
}

export const LeftoverStorageGuideCard = memo(function LeftoverStorageGuideCard({
  dishes,
  title = "Bảo quản & An toàn sau bữa ăn",
  defaultExpanded = true
}: LeftoverStorageGuideCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const analysis = useMemo(() => analyzeMealLeftoverStorage(dishes), [dishes])

  if (analysis.rules.length === 0) {
    return null
  }

  return (
    <section
      aria-label="Hướng dẫn bảo quản thức ăn thừa"
      className="grid gap-4 rounded-3xl border border-edge bg-paper-raised p-5 sm:p-6"
      data-testid="leftover-storage-guide-card"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-herb-100 text-herb-800 dark:bg-herb-900/50 dark:text-herb-300">
            <span className="text-base" aria-hidden="true">
              🥡
            </span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">{title}</h3>
            <p className="text-xs text-ink-soft">
              Hạn dùng ngăn mát, mẹo hâm nóng và an toàn vệ sinh thực phẩm
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="leftover-storage-details"
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-paper px-3 py-1 text-xs font-semibold text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
        >
          <span>{expanded ? "Thu gọn" : "Xem chi tiết"}</span>
          <Icon
            name="chevronDown"
            className={`size-3.5 text-ink-soft transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Summary Hazard Banner */}
      {analysis.hasOvernightHazard && (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-900 sm:text-sm"
          data-testid="overnight-hazard-banner"
        >
          <div className="flex items-start gap-2.5">
            <span className="text-base shrink-0" aria-hidden="true">
              ⚠️
            </span>
            <div className="space-y-1">
              <p className="font-bold text-amber-950">Món không nên để qua đêm:</p>
              <p className="leading-relaxed text-amber-900">
                {analysis.overnightHazardDishes.join(", ")} — Rau lá xanh nấu chín vi khuẩn dễ
                chuyển hóa nitrat thành nitrit có hại. Hãy dùng hết trong bữa ăn gia đình.
              </p>
            </div>
          </div>
        </div>
      )}

      {expanded && (
        <div id="leftover-storage-details" className="space-y-4">
          {/* Dish storage breakdown */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Chi tiết bảo quản từng món
            </h4>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {analysis.rules.map((item, idx) => (
                <div
                  key={`${item.dishName}-${idx}`}
                  className="rounded-2xl border border-edge/80 bg-paper-sunken/40 p-3.5 space-y-2 text-xs"
                  data-testid={`storage-item-${idx}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-ink text-sm leading-snug">{item.dishName}</p>
                    <span
                      className={`inline-flex items-center gap-1 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${tierBadgeClass(
                        item.rule.safetyTier
                      )}`}
                    >
                      <span aria-hidden="true">{tierBadgeIcon(item.rule.safetyTier)}</span>
                      <span>{item.rule.tierLabelVi}</span>
                    </span>
                  </div>

                  <div className="space-y-1 text-ink-soft">
                    <p className="flex items-start gap-1.5">
                      <span className="font-semibold text-ink">Hộp đựng:</span>
                      <span>{item.rule.containerRecommendation}</span>
                    </p>
                    <p className="flex items-start gap-1.5">
                      <span className="font-semibold text-ink">Hâm nóng:</span>
                      <span>{item.rule.reheatingInstruction}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* General Best Practices */}
          <div className="rounded-2xl border border-edge/60 bg-herb-50/50 p-3.5 text-xs text-herb-900 space-y-1.5">
            <p className="font-bold text-herb-950 flex items-center gap-1.5">
              <Icon name="shield" className="size-3.5 text-herb-700" />3 nguyên tắc vàng bảo quản
              thức ăn thừa cơm nhà:
            </p>
            <ul className="list-disc pl-4 space-y-0.5 text-herb-800 leading-relaxed">
              <li>
                Đợi thức ăn nguội bớt (dưới 1 tiếng) rồi cất ngay vào tủ lạnh để tránh ôi thiu.
              </li>
              <li>Dùng hộp thủy tinh hoặc sứ có nắp đậy kín gioăng cao su, không để hở mùi.</li>
              <li>
                Luôn đun sôi lại kỹ sủi tăm (trên 70°C) tối thiểu 2 phút trước khi ăn bữa tiếp theo.
              </li>
            </ul>
          </div>
        </div>
      )}
    </section>
  )
})
