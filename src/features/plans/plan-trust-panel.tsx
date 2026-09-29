import type { PlanTrustView } from "@/application/planner/plan-trust"

const EXPLANATION_LABELS: Readonly<Record<string, string>> = {
  DIVERSITY_PRIMARY_PROTEIN_REPETITION: "Hạn chế lặp nhóm đạm",
  DIVERSITY_COOKING_STYLE_VARIETY: "Đa dạng cách nấu",
  DIVERSITY_ADJACENT_PRIMARY_PROTEIN: "Hạn chế lặp nhóm đạm liền ngày",
  COMPOSITION_MEAL_ROLES: "Cân đối vai trò món trong bữa",
  REUSE_DISTINCT_FOODS: "Tận dụng nguyên liệu giữa các bữa",
  REUSE_PACKAGE_LEFTOVER: "Hạn chế phần gói mua còn dư",
  REUSE_PANTRY_COVERAGE: "Tận dụng nguyên liệu có trong tủ bếp",
  PREFERENCES_MATCH: "Ưu tiên sở thích đã chọn",
  DIVERSITY_RECENT_WEEK_REPETITION: "Hạn chế lặp món vừa nấu gần đây",
  PREFERENCES_MEAL_RATING: "Ưu tiên món gia đình đã thích"
}

function displayDecimal(value: string): string {
  return value.replace(".", ",")
}

function displayDate(value: string): string {
  const [year, month, day] = value.split("-")
  return year === undefined || month === undefined || day === undefined
    ? value
    : `${day}/${month}/${year}`
}

export function PlanTrustPanel({ trust }: Readonly<{ trust: PlanTrustView }>) {
  const priceRange =
    trust.priceObservedFrom === null || trust.priceObservedTo === null
      ? null
      : `${displayDate(trust.priceObservedFrom)}–${displayDate(trust.priceObservedTo)}`

  return (
    <section className="rounded-3xl border border-edge bg-paper-raised p-5 shadow-soft">
      <h2 className="font-bold text-ink">Vì sao kế hoạch này phù hợp</h2>
      <div className="mt-3 grid gap-2 text-sm text-ink-soft sm:grid-cols-2">
        <p>
          {trust.adultEquivalent === null
            ? "Khẩu phần quy đổi chưa được ghi trong bản kế hoạch này."
            : `${displayDecimal(trust.adultEquivalent)} suất người lớn quy đổi`}
        </p>
        <p>Tính ngày {displayDate(trust.calculationDate)}</p>
        <p>
          {priceRange === null ? "Không có mốc giá để hiển thị." : `Giá quan sát ${priceRange}`}
        </p>
        <p>
          {trust.stalePriceCount === 0
            ? "Giá dùng để ước tính còn hiện hành."
            : `${trust.stalePriceCount} mức giá cũ nhưng vẫn dùng được để ước tính.`}
        </p>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-soft">
        Khẩu phần, dinh dưỡng, chi phí và điều kiện bắt buộc đã có đủ dữ liệu cho phép tính này. Đây
        là tiêu chí lập thực đơn minh bạch, không phải khuyến nghị y khoa.
      </p>
      <details className="mt-3 rounded-2xl bg-paper-sunken px-3 py-2 text-sm">
        <summary className="cursor-pointer font-semibold text-ink">Xem tiêu chí xếp hạng</summary>
        <ul className="mt-2 grid gap-1 text-ink-soft">
          {trust.explanationCodes.map((code) => (
            <li key={code}>{EXPLANATION_LABELS[code] ?? code}</li>
          ))}
        </ul>
      </details>
    </section>
  )
}
