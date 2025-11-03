import { describe, it, expect } from 'vitest'
import {
  getPeriodFromDateString,
  addMonthsToPeriod,
  diffPeriods,
  periodRange,
  parsePeriodKey,
  periodToIndex,
} from '../src/utils/formatters.js'

describe('getPeriodFromDateString', () => {
  it('returns period for ISO date strings', () => {
    expect(getPeriodFromDateString('2025-01-15')).toBe('2025-01')
  })

  it('returns multiple candidates for ambiguous slash dates', () => {
    expect(getPeriodFromDateString('01/02/2025')).toEqual(['2025-02', '2025-01'])
  })

  it('returns a single candidate when only one combination is valid', () => {
    expect(getPeriodFromDateString('13/02/2025')).toBe('2025-02')
  })

  it('parses other recognizable date formats', () => {
    expect(getPeriodFromDateString('February 10, 2025')).toBe('2025-02')
  })

  it('returns null for invalid date strings', () => {
    expect(getPeriodFromDateString('not a date')).toBeNull()
    expect(getPeriodFromDateString('99/99/2025')).toBeNull()
  })
})

describe('addMonthsToPeriod', () => {
  it('adds positive months within the same year', () => {
    expect(addMonthsToPeriod('2024-01', 2)).toBe('2024-03')
  })

  it('adds months across year boundaries', () => {
    expect(addMonthsToPeriod('2024-12', 2)).toBe('2025-02')
  })

  it('handles negative month offsets', () => {
    expect(addMonthsToPeriod('2024-01', -1)).toBe('2023-12')
  })
})

describe('diffPeriods', () => {
  it('calculates forward differences in months', () => {
    expect(diffPeriods('2024-01', '2024-04')).toBe(3)
  })

  it('calculates negative differences when end precedes start', () => {
    expect(diffPeriods('2024-04', '2024-01')).toBe(-3)
  })

  it('handles differences across years', () => {
    expect(diffPeriods('2023-11', '2024-02')).toBe(3)
  })
})

describe('periodRange', () => {
  it('builds inclusive ranges between periods', () => {
    expect(periodRange('2024-01', '2024-03')).toEqual([
      '2024-01',
      '2024-02',
      '2024-03',
    ])
  })

  it('returns only the start when both periods match', () => {
    expect(periodRange('2024-05', '2024-05')).toEqual(['2024-05'])
  })

  it('returns an empty array when start is after end', () => {
    expect(periodRange('2024-05', '2024-04')).toEqual([])
  })

  it('handles long ranges without duplication', () => {
    const range = periodRange('2020-01', '2022-12')
    expect(range[0]).toBe('2020-01')
    expect(range[range.length - 1]).toBe('2022-12')
    expect(range.length).toBe(36)
  })
})

describe('parsePeriodKey', () => {
  it('parses valid period keys into the expected date', () => {
    const date = parsePeriodKey('2024-01')
    expect(date.getFullYear()).toBe(2024)
    expect(date.getMonth()).toBe(0)
    expect(date.getDate()).toBe(1)
    expect(periodToIndex('2024-01')).toBe(2024 * 12)
  })

  it('clamps out-of-range months to the nearest valid month', () => {
    const upper = parsePeriodKey('2024-15')
    expect(upper.getFullYear()).toBe(2024)
    expect(upper.getMonth()).toBe(11)

    const lower = parsePeriodKey('2024-00')
    expect(lower.getFullYear()).toBe(2024)
    expect(lower.getMonth()).toBe(0)
  })
})
