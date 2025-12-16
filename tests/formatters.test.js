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

  it('returns null for ambiguous slash dates to avoid returning arrays', () => {
    expect(getPeriodFromDateString('01/02/2025')).toBeNull()
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

  it('returns null for invalid period keys or month offsets', () => {
    expect(addMonthsToPeriod('not-a-period', 1)).toBeNull()
    expect(addMonthsToPeriod('2024-01', 'abc')).toBeNull()
    expect(addMonthsToPeriod(null, 1)).toBeNull()
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

  it('returns NaN when any period is invalid', () => {
    expect(Number.isNaN(diffPeriods('2024-01', 'invalid'))).toBe(true)
    expect(Number.isNaN(diffPeriods('bad', '2024-01'))).toBe(true)
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

  it('rejects out-of-range months', () => {
    expect(parsePeriodKey('2024-15')).toBeNull()
    expect(parsePeriodKey('2024-00')).toBeNull()
  })

  it('returns null for non-string values', () => {
    expect(parsePeriodKey(null)).toBeNull()
  })
})

describe('periodToIndex', () => {
  it('returns index for valid periods', () => {
    expect(periodToIndex('2024-01')).toBe(2024 * 12)
  })

  it('returns NaN for invalid periods', () => {
    expect(Number.isNaN(periodToIndex('2024-13'))).toBe(true)
  })
})
