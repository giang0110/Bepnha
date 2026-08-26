import Decimal from "decimal.js"

const DECIMAL_PRECISION = 80
const DEFAULT_MAX_SCALE = 18
const DEFAULT_MAX_INTEGER_DIGITS = 34

export const ROUND_HALF_UP = Decimal.ROUND_HALF_UP
export const ROUND_CEIL = Decimal.ROUND_CEIL

export const ExactDecimal = Decimal.clone({
  precision: DECIMAL_PRECISION,
  rounding: ROUND_HALF_UP,
  toExpNeg: -DECIMAL_PRECISION,
  toExpPos: DECIMAL_PRECISION
})

export type ExactDecimalValue = Decimal

export interface DecimalConstraints {
  readonly maxScale?: number
  readonly maxIntegerDigits?: number
  readonly allowNegative?: boolean
  readonly allowZero?: boolean
}

export type DecimalParseResult =
  | { readonly ok: true; readonly value: ExactDecimalValue }
  | {
      readonly ok: false
      readonly error: { readonly code: "INVALID_DECIMAL"; readonly input: string }
    }

const CANONICAL_DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u

function invalidDecimal(input: string): DecimalParseResult {
  return { ok: false, error: { code: "INVALID_DECIMAL", input } }
}

function isValidLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

export function parseCanonicalDecimal(
  input: string,
  constraints: DecimalConstraints = {}
): DecimalParseResult {
  const maxScale = constraints.maxScale ?? DEFAULT_MAX_SCALE
  const maxIntegerDigits = constraints.maxIntegerDigits ?? DEFAULT_MAX_INTEGER_DIGITS

  if (!isValidLimit(maxScale) || !isValidLimit(maxIntegerDigits) || maxIntegerDigits === 0) {
    return invalidDecimal(input)
  }

  if (!CANONICAL_DECIMAL_PATTERN.test(input)) {
    return invalidDecimal(input)
  }

  const unsignedInput = input.startsWith("-") ? input.slice(1) : input
  const [integerPart = "", fractionalPart = ""] = unsignedInput.split(".")
  if (integerPart.length > maxIntegerDigits || fractionalPart.length > maxScale) {
    return invalidDecimal(input)
  }

  const value = new ExactDecimal(input)
  if (
    (input.startsWith("-") && value.isZero()) ||
    (constraints.allowNegative === false && value.isNegative()) ||
    (constraints.allowZero === false && value.isZero())
  ) {
    return invalidDecimal(input)
  }

  return { ok: true, value }
}

export function decimalToCanonical(value: ExactDecimalValue): string {
  if (!value.isFinite()) {
    throw new Error("INVALID_DECIMAL_RESULT")
  }

  if (value.isZero()) {
    return "0"
  }

  return value.toFixed().replace(/(?:\.0+|(?<fraction>\.\d*?)0+)$/u, "$<fraction>")
}

export function roundDecimal(
  value: ExactDecimalValue,
  decimalPlaces: number,
  roundingMode: typeof ROUND_HALF_UP | typeof ROUND_CEIL
): string {
  if (!isValidLimit(decimalPlaces)) {
    throw new Error("INVALID_DECIMAL_PLACES")
  }

  return decimalToCanonical(value.toDecimalPlaces(decimalPlaces, roundingMode))
}
