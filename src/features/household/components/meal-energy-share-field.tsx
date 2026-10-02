export function MealEnergyShareField({
  value,
  onChange
}: {
  readonly value: string
  readonly onChange: (value: string) => void
}) {
  const valid = /^\d{2}$/u.test(value.trim()) && Number(value) >= 20 && Number(value) <= 50
  return (
    <div className="rounded-2xl border border-edge p-4">
      <label htmlFor="meal-energy-share" className="font-medium">
        Tỷ lệ năng lượng cho một bữa chính (%)
      </label>
      <input
        id="meal-energy-share"
        className="mt-2 h-11 w-full rounded-xl border border-edge-strong px-3"
        inputMode="numeric"
        type="text"
        value={value}
        aria-invalid={!valid}
        aria-describedby="meal-energy-share-help"
        onChange={(e) => onChange(e.target.value)}
      />
      <p id="meal-energy-share-help" className="mt-2 text-sm text-ink-soft">
        7 bữa chính mỗi tuần, mỗi ngày một bữa. Mặc định 33% năng lượng ngày; chọn từ 20% đến 50%.
        Các bữa còn lại chưa được lập.
      </p>
      {!valid ? <p role="alert">Nhập số nguyên từ 20 đến 50.</p> : null}
    </div>
  )
}
