import { describe, expect, it } from 'vitest'
import { businessDayIso, businessWeekday } from './day'
import { countedOn, isWeekendOrderDay } from './measure'

// 2026-11-26 is a Thursday.
const at = (s: string) => new Date(s)

describe('working day (until 07:00 it is still the previous day)', () => {
  it('keeps Thursday evening on Thursday', () => {
    expect(businessDayIso(at('2026-11-26T23:00'))).toBe('2026-11-26')
    expect(businessWeekday(at('2026-11-26T23:00'))).toBe(4)
  })

  it('counts Friday 01:00 and 06:59 as Thursday', () => {
    expect(businessDayIso(at('2026-11-27T01:00'))).toBe('2026-11-26')
    expect(businessDayIso(at('2026-11-27T06:59'))).toBe('2026-11-26')
  })

  it('starts Friday at 07:00', () => {
    expect(businessDayIso(at('2026-11-27T07:00'))).toBe('2026-11-27')
  })

  it('crosses a month boundary', () => {
    expect(businessDayIso(at('2026-12-01T02:00'))).toBe('2026-11-30')
  })

  it('applies the weekend order rule to a Thursday popis after midnight', () => {
    expect(isWeekendOrderDay(at('2026-11-26T22:00'))).toBe(true)
    expect(isWeekendOrderDay(at('2026-11-27T01:30'))).toBe(true)
    expect(isWeekendOrderDay(at('2026-11-27T09:00'))).toBe(false)
  })

  it('shows Thursday-only articles in a popis after midnight', () => {
    expect(countedOn({ count_weekday: 4 }, at('2026-11-27T01:00'))).toBe(true)
    expect(countedOn({ count_weekday: 5 }, at('2026-11-27T01:00'))).toBe(false)
    expect(countedOn({ count_weekday: null }, at('2026-11-27T01:00'))).toBe(true)
  })
})
