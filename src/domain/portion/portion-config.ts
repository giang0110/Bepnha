export const PORTION_MEMBER_BANDS = [
  "adult",
  "1_3",
  "4_6",
  "7_9",
  "10_12",
  "13_17",
  "elderly"
] as const

export type PortionMemberBand = (typeof PORTION_MEMBER_BANDS)[number]

export interface PortionConfigV1 {
  readonly version: "portion-v1"
  readonly coefficients: Readonly<{
    adult: string
    child_1_3: string
    child_4_6: string
    child_7_9: string
    child_10_12: string
    child_13_17: string
    elderly: string
  }>
}

const coefficients = Object.freeze({
  adult: "1",
  child_1_3: "0.4",
  child_4_6: "0.55",
  child_7_9: "0.7",
  child_10_12: "0.85",
  child_13_17: "1",
  elderly: "0.85"
})

export const PORTION_CONFIG_V1: PortionConfigV1 = Object.freeze({
  version: "portion-v1",
  coefficients
})
