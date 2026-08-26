import { ExactDecimal, decimalToCanonical, parseCanonicalDecimal } from "@/domain/shared/decimal"
import {
  PORTION_CONFIG_V1,
  PORTION_MEMBER_BANDS,
  type PortionConfigV1,
  type PortionMemberBand
} from "@/domain/portion/portion-config"

export interface PortionMemberGroupInput {
  readonly memberKind: string
  readonly ageBand: string
  readonly memberCount: number
}

export interface NormalizedPortionMemberGroup {
  readonly memberKind: "adult" | "child" | "elderly"
  readonly ageBand: PortionMemberBand
  readonly memberCount: number
}

export type PortionCalculationErrorCode =
  | "INVALID_PORTION_CONFIG"
  | "UNSUPPORTED_MEMBER_BAND"
  | "INVALID_MEMBER_GROUPS"
  | "INVALID_MEMBER_TOTAL"

export type AdultEquivalentResult =
  | {
      readonly ok: true
      readonly value: {
        readonly memberGroups: readonly NormalizedPortionMemberGroup[]
        readonly adultEquivalent: string
      }
    }
  | { readonly ok: false; readonly error: { readonly code: PortionCalculationErrorCode } }

const EXPECTED_MEMBER_KIND: Readonly<
  Record<PortionMemberBand, NormalizedPortionMemberGroup["memberKind"]>
> = {
  adult: "adult",
  "1_3": "child",
  "4_6": "child",
  "7_9": "child",
  "10_12": "child",
  "13_17": "child",
  elderly: "elderly"
}

const COEFFICIENT_KEY: Readonly<Record<PortionMemberBand, keyof PortionConfigV1["coefficients"]>> =
  {
    adult: "adult",
    "1_3": "child_1_3",
    "4_6": "child_4_6",
    "7_9": "child_7_9",
    "10_12": "child_10_12",
    "13_17": "child_13_17",
    elderly: "elderly"
  }

function failure(code: PortionCalculationErrorCode): AdultEquivalentResult {
  return { ok: false, error: { code } }
}

function isPortionMemberBand(value: string): value is PortionMemberBand {
  return PORTION_MEMBER_BANDS.some((band) => band === value)
}

function validateConfig(config: PortionConfigV1): boolean {
  if (config.version !== PORTION_CONFIG_V1.version) {
    return false
  }

  const actualKeys = Object.keys(config.coefficients).sort()
  const expectedKeys = Object.keys(PORTION_CONFIG_V1.coefficients).sort()
  if (actualKeys.join("|") !== expectedKeys.join("|")) {
    return false
  }

  return expectedKeys.every((key) => {
    const coefficient = config.coefficients[key as keyof PortionConfigV1["coefficients"]]
    return parseCanonicalDecimal(coefficient, {
      maxScale: 4,
      maxIntegerDigits: 2,
      allowNegative: false,
      allowZero: false
    }).ok
  })
}

export function calculateAdultEquivalent(
  groups: readonly PortionMemberGroupInput[],
  config: PortionConfigV1 = PORTION_CONFIG_V1
): AdultEquivalentResult {
  if (!validateConfig(config)) {
    return failure("INVALID_PORTION_CONFIG")
  }

  const seenBands = new Set<PortionMemberBand>()
  const normalizedGroups: NormalizedPortionMemberGroup[] = []
  let memberTotal = 0

  for (const group of groups) {
    if (!isPortionMemberBand(group.ageBand)) {
      return failure("UNSUPPORTED_MEMBER_BAND")
    }

    if (
      seenBands.has(group.ageBand) ||
      EXPECTED_MEMBER_KIND[group.ageBand] !== group.memberKind ||
      !Number.isSafeInteger(group.memberCount)
    ) {
      return failure("INVALID_MEMBER_GROUPS")
    }

    if (group.memberCount <= 0 || group.memberCount > 20) {
      return failure("INVALID_MEMBER_TOTAL")
    }

    seenBands.add(group.ageBand)
    memberTotal += group.memberCount
    normalizedGroups.push({
      memberKind: EXPECTED_MEMBER_KIND[group.ageBand],
      ageBand: group.ageBand,
      memberCount: group.memberCount
    })
  }

  if (memberTotal < 1 || memberTotal > 20) {
    return failure("INVALID_MEMBER_TOTAL")
  }

  normalizedGroups.sort(
    (left, right) =>
      PORTION_MEMBER_BANDS.indexOf(left.ageBand) - PORTION_MEMBER_BANDS.indexOf(right.ageBand)
  )

  const adultEquivalent = normalizedGroups.reduce((total, group) => {
    const coefficientKey = COEFFICIENT_KEY[group.ageBand]
    const coefficient = parseCanonicalDecimal(config.coefficients[coefficientKey])
    if (!coefficient.ok) {
      return total
    }

    return total.plus(coefficient.value.times(group.memberCount))
  }, new ExactDecimal(0))

  return {
    ok: true,
    value: {
      memberGroups: normalizedGroups,
      adultEquivalent: decimalToCanonical(adultEquivalent)
    }
  }
}
