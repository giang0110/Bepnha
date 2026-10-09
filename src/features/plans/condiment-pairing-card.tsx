import { useMemo, useState } from "react"

import { Icon } from "@/app/components/ui/icon"
import { toast } from "@/app/components/ui/toast"
import {
  recommendMealCondiments,
  type CondimentRecipe,
  type MealCondimentPairingResult
} from "@/domain/recipe/vietnamese-condiment-pairing"

export interface CondimentPairingCardProps {
  readonly mealNameVi: string
  readonly dishNames?: readonly string[]
  readonly dishRoles?: readonly string[]
  readonly compact?: boolean
}

export function CondimentPairingCard({
  mealNameVi,
  dishNames,
  dishRoles,
  compact = false
}: Readonly<CondimentPairingCardProps>) {
  const pairingResult: MealCondimentPairingResult = useMemo(
    () => recommendMealCondiments({ mealNameVi, dishNames, dishRoles }),
    [mealNameVi, dishNames, dishRoles]
  )

  const [expandedSauceId, setExpandedSauceId] = useState<string | null>(null)

  const toggleExpand = (id: string) => {
    setExpandedSauceId((prev) => (prev === id ? null : id))
  }

  const handleCopyRecipe = async (sauce: CondimentRecipe) => {
    const text = [
      `🥣 CÔNG THỨC PHA ${sauce.nameVi.toUpperCase()}`,
      `✨ Tỷ lệ vàng: ${sauce.goldenRatioVi}`,
      `📌 Nguyên liệu:`,
      ...sauce.ingredientsVi.map((ing) => ` - ${ing}`),
      `👨‍🍳 Cách làm: ${sauce.instructionVi}`
    ].join("\n")

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        toast.success(`Đã sao chép công thức ${sauce.nameVi}!`)
      } else {
        toast.error("Thiết bị không hỗ trợ sao chép tự động.")
      }
    } catch {
      toast.error("Không thể sao chép công thức lúc này.")
    }
  }

  return (
    <div
      data-testid="condiment-pairing-card"
      className={`rounded-3xl border border-edge bg-paper-raised p-5 shadow-xs transition-all ${
        compact ? "space-y-3" : "space-y-4"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-2xl bg-amber-100 text-amber-900">
            <Icon name="bowl" className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-ink">Gợi ý nước chấm & ăn kèm chuẩn vị</h3>
            <p className="text-xs text-ink-soft">
              Bí quyết mâm cơm chuẩn phong vị truyền thống Việt Nam
            </p>
          </div>
        </div>
      </div>

      {/* Contextual Pairing Advice */}
      <div className="rounded-2xl border border-amber-200/60 bg-amber-50/50 p-3 text-xs leading-relaxed text-amber-950">
        <span className="font-bold">Mẹo đầu bếp: </span>
        {pairingResult.pairingNoteVi}
      </div>

      {/* Dipping Sauces Section */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
          Nước chấm đề xuất ({pairingResult.recommendedSauces.length})
        </h4>

        <div className="grid gap-3 sm:grid-cols-1">
          {pairingResult.recommendedSauces.map((sauce) => {
            const isExpanded = expandedSauceId === sauce.id
            return (
              <div
                key={sauce.id}
                className="rounded-2xl border border-edge bg-paper p-3.5 transition-colors hover:border-amber-300/80"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-sm text-ink">{sauce.nameVi}</span>
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                        {sauce.goldenRatioVi}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">{sauce.summaryVi}</p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <button
                      type="button"
                      onClick={() => toggleExpand(sauce.id)}
                      className="rounded-xl border border-edge bg-paper-sunken px-2.5 py-1 text-xs font-semibold text-ink-soft hover:bg-paper hover:text-ink transition-colors"
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? "Thu gọn" : "Xem cách pha"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyRecipe(sauce)}
                      className="rounded-xl border border-amber-200 bg-amber-100/70 p-1.5 text-amber-900 hover:bg-amber-200 transition-colors"
                      title="Sao chép công thức"
                      aria-label="Sao chép công thức"
                    >
                      <Icon name="share" className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Recipe Details */}
                {isExpanded && (
                  <div className="mt-3 border-t border-edge/60 pt-3 text-xs space-y-2 animate-in fade-in duration-200">
                    <div>
                      <span className="font-bold text-ink">Định lượng nguyên liệu:</span>
                      <ul className="mt-1 list-disc list-inside space-y-0.5 text-ink-soft">
                        {sauce.ingredientsVi.map((ingredient, idx) => (
                          <li key={idx}>{ingredient}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <span className="font-bold text-ink">Cách pha: </span>
                      <span className="text-ink-soft leading-relaxed">{sauce.instructionVi}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Side Dishes Recommendations */}
      {pairingResult.recommendedSideDishes.length > 0 && (
        <div className="border-t border-edge/60 pt-3 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            Món ăn kèm chống ngấy ({pairingResult.recommendedSideDishes.length})
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {pairingResult.recommendedSideDishes.map((side) => (
              <div
                key={side.id}
                className="rounded-xl border border-edge/80 bg-paper p-2.5 text-xs"
              >
                <div className="font-bold text-herb-800">{side.nameVi}</div>
                <div className="mt-0.5 text-[11px] text-ink-soft leading-snug">{side.reasonVi}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
