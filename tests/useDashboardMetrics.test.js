import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let mockState
let useDashboardMetrics

vi.mock('../src/store/useBackofficeStore.js', () => ({
  CLIENT_PRICE: 300,
  useBackofficeStore: (selector) => selector(mockState),
}))

beforeAll(async () => {
  ;({ useDashboardMetrics } = await import('../src/hooks/useDashboardMetrics.js'))
})

const renderHook = (props) => {
  let hookResult

  const TestComponent = (componentProps) => {
    hookResult = useDashboardMetrics(componentProps)
    return null
  }

  renderToStaticMarkup(createElement(TestComponent, props))

  return hookResult
}

describe('useDashboardMetrics', () => {
  beforeEach(() => {
    mockState = {
      clients: [
        {
          id: 'c-1',
          monthlyFee: 150,
          debtMonths: 2,
          paidMonthsAhead: 0,
          service: 'Suspendido',
        },
        {
          id: 'c-2',
          monthlyFee: 200,
          debtMonths: 1.5,
          paidMonthsAhead: 0,
          service: 'Suspendido',
        },
        {
          id: 'c-3',
          monthlyFee: 250,
          debtMonths: 0,
          paidMonthsAhead: 0,
          service: 'Activo',
        },
      ],
      resellers: [
        {
          id: 'r-1',
          settlements: [
            { id: 's-1', date: '2025-01', myGain: 100 },
            { id: 's-2', date: '2024-12', myGain: 50 },
          ],
        },
      ],
      expenses: [
        { id: 'e-1', date: '2025-01', amount: 200 },
        { id: 'e-2', date: '2024-12', amount: 50 },
      ],
      baseCosts: { base1: 100, base2: 200 },
      periods: { current: '2025-01', selected: '2025-01' },
    }
  })

  it('calculates the total debt amount from projected clients without throwing', () => {
    const result = renderHook({ statusFilter: 'all', searchTerm: '' })

    expect(result.metrics.totalDebtAmount).toBeCloseTo(600)
    expect(result.metrics).toMatchObject({ totalClients: 3, pendingClients: 2 })
  })
})
