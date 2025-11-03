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
    metrics: {
      total_clients: 3,
      paid_clients: 1,
      pending_clients: 2,
      client_income: '500.00',
      total_debt_amount: '350.50',
      reseller_income: '150.00',
      total_expenses: '200.00',
      internet_costs: '120.00',
      net_earnings: '330.50',
    },
    dashboardClients: [
      {
        id: 'c-1',
        name: 'Alice',
        location: 'Centro',
        monthly_fee: '150.00',
        debt_months: '2.0',
        paid_months_ahead: '0',
        service_status: 'Suspendido',
        client_type: 'residential',
      },
      {
        id: 'c-2',
        name: 'Bob',
        location: 'Norte',
        monthly_fee: '200.00',
        debt_months: '0',
        paid_months_ahead: '1',
        service_status: 'Activo',
        client_type: 'token',
      },
    ],
    baseCosts: { base1: 100, base2: 50 },
  }
})

it('returns backend-provided metrics and normalized clients', () => {
  const result = renderHook()

  expect(result.metrics).toMatchObject({
    totalClients: 3,
    pendingClients: 2,
    paidClients: 1,
    netEarnings: 330.5,
  })
  expect(result.metrics.totalDebtAmount).toBeCloseTo(350.5)
  expect(result.filteredClients).toHaveLength(2)
  expect(result.filteredClients[0]).toMatchObject({
    name: 'Alice',
    debtMonths: 2,
    monthlyFee: 150,
  })
})
})
