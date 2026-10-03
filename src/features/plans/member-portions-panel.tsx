import type { MemberMealPortion } from "@/domain/portion/calculate-member-meal-portions"
import { energyReasonLabel } from "./nutrition-labels"
export function MemberPortionsPanel({
  portions,
  plannedMealSharePercent
}: {
  readonly portions: readonly (MemberMealPortion & { readonly actualMealKcal: string })[]
  readonly plannedMealSharePercent: number | null
}) {
  return (
    <section className="rounded-2xl border border-edge bg-paper-raised p-4">
      <h3 className="font-bold">Khẩu phần từng người</h3>
      <p className="mt-1 text-xs text-ink-soft">
        Một bữa chính mỗi ngày
        {plannedMealSharePercent === null
          ? ""
          : `, mục tiêu ${plannedMealSharePercent}% năng lượng ngày`}
        . Chia đều từng món theo tỷ lệ dưới đây.
      </p>
      <ul className="mt-3 grid gap-3">
        {portions.map((p) => (
          <li key={p.recipientKey}>
            <p className="font-semibold">
              {p.label ||
                (p.memberKind === "child"
                  ? `Trẻ ${p.ageBand.replaceAll("_", "–")} tuổi`
                  : p.memberKind === "elderly"
                    ? "Người cao tuổi"
                    : "Người lớn")}
              {p.memberCount > 1 ? ` (${p.memberCount} người)` : ""}
            </p>
            <p>
              {(Number(p.sharePerMember) * 100).toLocaleString("vi-VN", {
                maximumFractionDigits: 1
              })}
              % mỗi người · Thực tế {Math.round(Number(p.actualMealKcal)).toLocaleString("vi-VN")}{" "}
              kcal/người.
            </p>
            {p.energyTargetStatus === "applied" ? (
              <p>
                Mục tiêu {Math.round(Number(p.mealTargetKcal)).toLocaleString("vi-VN")} kcal/người.
              </p>
            ) : (
              <p className="text-ink-soft">
                {p.unappliedReason === "PROFILE_NOT_STATED" || p.memberKind === "child"
                  ? "Dùng khẩu phần theo nhóm tuổi."
                  : energyReasonLabel(p.unappliedReason ?? "INCOMPLETE_PROFILE")}
              </p>
            )}
            {p.energyTargetStatus === "applied" && ["0.5", "2"].includes(p.coefficientPerMember) ? (
              <p className="text-xs text-ink-soft">
                Khẩu phần đang ở giới hạn điều chỉnh 0,5–2 suất chuẩn; lượng thực tế có thể khác mục
                tiêu.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
