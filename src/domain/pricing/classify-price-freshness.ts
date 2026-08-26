import { PRICE_FRESHNESS_CONFIG_V1, type PriceFreshnessConfigV1 } from "@/domain/pricing/pricing"

export interface StalePriceWarning {
  readonly code: "STALE_PRICE"
  readonly observedAt: string
  readonly ageDays: number
}

export type FatalPriceError = {
  readonly code:
    | "MISSING_PRICE"
    | "PRICE_TOO_OLD"
    | "FUTURE_PRICE"
    | "INVALID_PRICE_DATE"
    | "INVALID_PRICE_CONFIG"
}

export type PriceFreshnessResult =
  | { readonly ok: true; readonly freshness: "current"; readonly warnings: readonly [] }
  | {
      readonly ok: true
      readonly freshness: "stale_usable"
      readonly warnings: readonly [StalePriceWarning]
    }
  | { readonly ok: false; readonly error: FatalPriceError }

const ISO_DATE_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u
const MILLISECONDS_PER_DAY = 86_400_000

function parseIsoCalendarDate(value: string): number | null {
  const match = ISO_DATE_PATTERN.exec(value)
  if (match?.groups === undefined) return null

  const year = Number(match.groups.year)
  const month = Number(match.groups.month)
  const day = Number(match.groups.day)
  const timestamp = Date.UTC(year, month - 1, day)
  const roundTrip = new Date(timestamp).toISOString().slice(0, 10)
  return roundTrip === value ? timestamp : null
}

function configIsValid(config: PriceFreshnessConfigV1): boolean {
  return (
    config.version === PRICE_FRESHNESS_CONFIG_V1.version &&
    config.currentMaxAgeDays === PRICE_FRESHNESS_CONFIG_V1.currentMaxAgeDays &&
    config.usableMaxAgeDays === PRICE_FRESHNESS_CONFIG_V1.usableMaxAgeDays &&
    Number.isSafeInteger(config.currentMaxAgeDays) &&
    Number.isSafeInteger(config.usableMaxAgeDays) &&
    config.currentMaxAgeDays >= 0 &&
    config.usableMaxAgeDays >= config.currentMaxAgeDays
  )
}

export function classifyPriceFreshness(
  observedAt: string | null,
  calculationDate: string,
  config: PriceFreshnessConfigV1 = PRICE_FRESHNESS_CONFIG_V1
): PriceFreshnessResult {
  if (!configIsValid(config)) {
    return { ok: false, error: { code: "INVALID_PRICE_CONFIG" } }
  }

  if (observedAt === null) {
    return { ok: false, error: { code: "MISSING_PRICE" } }
  }

  const observedTimestamp = parseIsoCalendarDate(observedAt)
  const calculationTimestamp = parseIsoCalendarDate(calculationDate)
  if (observedTimestamp === null || calculationTimestamp === null) {
    return { ok: false, error: { code: "INVALID_PRICE_DATE" } }
  }

  const ageDays = (calculationTimestamp - observedTimestamp) / MILLISECONDS_PER_DAY
  if (ageDays < 0) {
    return { ok: false, error: { code: "FUTURE_PRICE" } }
  }
  if (ageDays <= config.currentMaxAgeDays) {
    return { ok: true, freshness: "current", warnings: [] }
  }
  if (ageDays <= config.usableMaxAgeDays) {
    return {
      ok: true,
      freshness: "stale_usable",
      warnings: [{ code: "STALE_PRICE", observedAt, ageDays }]
    }
  }

  return { ok: false, error: { code: "PRICE_TOO_OLD" } }
}
