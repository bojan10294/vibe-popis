// The working day. The place closes after midnight, so everything before
// 07:00 still belongs to the previous day: a popis at 01:00 on Friday is
// Thursday's popis (weekend ordering, weekly articles, dates).

export const DAY_STARTS_AT_HOUR = 7

/** The calendar day this moment belongs to (as a local Date at that day's time minus 7 h). */
export function businessDay(at: Date = new Date()): Date {
  const d = new Date(at)
  d.setHours(d.getHours() - DAY_STARTS_AT_HOUR)
  return d
}

/** "2026-11-27" for the working day of `at` (local time, not UTC). */
export function businessDayIso(at: Date = new Date()): string {
  const d = businessDay(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 0 = Sunday … 6 = Saturday, like getDay(), for the working day of `at`. */
export function businessWeekday(at: Date = new Date()): number {
  return businessDay(at).getDay()
}
