export function parseVnd(value: string): number | null {
  const normalized = value.replace(/[.,\s]/gu, "")
  if (!/^\d+$/u.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)
}
