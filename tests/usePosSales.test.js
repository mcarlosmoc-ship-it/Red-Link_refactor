import { describe, expect, it } from 'vitest'
import { formatSaleTotal } from '../src/hooks/usePosSales.js'
import { peso } from '../src/utils/formatters.js'

describe('formatSaleTotal', () => {
  it('returns formatted total when sale has a total value', () => {
    const sale = { total: 1234.56 }

    const result = formatSaleTotal(sale)

    expect(result).toBe(peso(sale.total))
  })

  it('falls back to zero and does not throw when total is missing', () => {
    expect(() => formatSaleTotal({})).not.toThrow()
    expect(formatSaleTotal({})).toBe(peso(0))
    expect(formatSaleTotal()).toBe(peso(0))
  })
})
