/**
 * Vietnamese Lunisolar Calendar Conversion
 *
 * Based on the astronomical algorithm developed by Hồ Ngọc Đức (University of Leipzig),
 * computing Julian Day Number (JDN), New Moon (Sóc) and Major Solar Terms (Trung khí)
 * referenced at standard Vietnamese timezone UTC+7 (105°E).
 *
 * Deterministic, standalone, zero dependencies.
 */

const PI = Math.PI

export interface VietnameseLunarDate {
  readonly day: number
  readonly month: number
  readonly year: number
  readonly isLeap: boolean
  readonly isVegetarianDay: boolean
  readonly formattedShort: string
  readonly specialDayLabel: string | null
}

function INT(d: number): number {
  return Math.floor(d)
}

function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = INT((14 - mm) / 12)
  const y = yy + 4800 - a
  const m = mm + 12 * a - 3
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045
  if (jd < 2299161) {
    jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083
  }
  return jd
}

function newMoon(k: number): number {
  const T = k / 1236.85
  const T2 = T * T
  const T3 = T2 * T
  const dr = PI / 180

  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr)

  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3

  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M)
  C1 -= 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr)
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr)
  C1 += 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr))
  C1 -= 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M))
  C1 -= 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr))
  C1 += 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M))

  const deltat =
    T < -11
      ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2

  return jd1 + C1 - deltat
}

function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545.0) / 36525
  const T2 = T * T
  const dr = PI / 180

  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2

  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M)
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M)

  let L = (L0 + DL) * dr
  L -= PI * 2 * INT(L / (PI * 2))
  return L
}

function getSunLongitude(dayNumber: number, timeZone: number): number {
  return INT((sunLongitude(dayNumber - 0.5 - timeZone / 24) / PI) * 6)
}

function getNewMoonDay(k: number, timeZone: number): number {
  return INT(newMoon(k) + 0.5 + timeZone / 24)
}

function getLunarMonth11(yy: number, timeZone: number): number {
  const off = jdFromDate(31, 12, yy) - 2415021
  const k = INT(off / 29.530588853)
  let nm = getNewMoonDay(k, timeZone)
  const sunLong = getSunLongitude(nm, timeZone)
  if (sunLong >= 9) {
    nm = getNewMoonDay(k - 1, timeZone)
  }
  return nm
}

function getLeapMonthOffset(a11: number, timeZone: number): number {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5)
  let last: number
  let i = 1
  let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone)
  do {
    last = arc
    i++
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone)
  } while (arc !== last && i < 14)
  return i - 1
}

function convertSolar2Lunar(
  dd: number,
  mm: number,
  yy: number,
  timeZone = 7.0
): [number, number, number, boolean] {
  const dayNumber = jdFromDate(dd, mm, yy)
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853)
  let monthStart = getNewMoonDay(k + 1, timeZone)
  if (monthStart > dayNumber) {
    monthStart = getNewMoonDay(k, timeZone)
  }

  let a11 = getLunarMonth11(yy, timeZone)
  let b11 = a11
  let lunarYear: number

  if (a11 >= monthStart) {
    lunarYear = yy
    a11 = getLunarMonth11(yy - 1, timeZone)
  } else {
    lunarYear = yy + 1
    b11 = getLunarMonth11(yy + 1, timeZone)
  }

  const lunarDay = dayNumber - monthStart + 1
  const diff = INT((monthStart - a11) / 29)
  let lunarLeap = false
  let lunarMonth = diff + 11

  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, timeZone)
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10
      if (diff === leapMonthDiff) {
        lunarLeap = true
      }
    }
  }

  if (lunarMonth > 12) {
    lunarMonth -= 12
  }
  if (lunarMonth >= 11 && diff < 4) {
    lunarYear -= 1
  }

  return [lunarDay, lunarMonth, lunarYear, lunarLeap]
}

function parseSolarDate(dateInput: Date | string): { day: number; month: number; year: number } {
  if (typeof dateInput === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateInput)
    if (match !== null) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3])
      }
    }
    const parsed = new Date(dateInput)
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      day: parsed.getDate()
    }
  }

  return {
    year: dateInput.getFullYear(),
    month: dateInput.getMonth() + 1,
    day: dateInput.getDate()
  }
}

/**
 * Converts a Gregorian (Solar) date to a Vietnamese Lunar Date with cultural dietary labels.
 */
export function solarToVietnameseLunar(solarDate: Date | string): VietnameseLunarDate {
  const { day, month, year } = parseSolarDate(solarDate)
  const [lunarDay, lunarMonth, lunarYear, isLeap] = convertSolar2Lunar(day, month, year, 7.0)

  const isVegetarianDay = lunarDay === 1 || lunarDay === 15
  const formattedShort = `${lunarDay}/${lunarMonth} Âl`

  let specialDayLabel: string | null = null
  if (lunarDay === 1) {
    specialDayLabel = "Mùng 1 Âm lịch"
  } else if (lunarDay === 15) {
    specialDayLabel = `Rằm tháng ${lunarMonth} Âm lịch`
  }

  return {
    day: lunarDay,
    month: lunarMonth,
    year: lunarYear,
    isLeap,
    isVegetarianDay,
    formattedShort,
    specialDayLabel
  }
}

export function isLunarVegetarianDay(solarDate: Date | string): boolean {
  return solarToVietnameseLunar(solarDate).isVegetarianDay
}

export function getLunarDayLabel(solarDate: Date | string): string {
  const lunar = solarToVietnameseLunar(solarDate)
  if (lunar.day === 15) {
    return `${lunar.formattedShort} (Rằm)`
  }
  if (lunar.day === 1) {
    return `${lunar.formattedShort} (Mùng 1)`
  }
  return lunar.formattedShort
}
