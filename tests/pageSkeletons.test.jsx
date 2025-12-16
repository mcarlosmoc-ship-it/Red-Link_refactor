import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BackofficeRefreshProvider } from '../src/contexts/BackofficeRefreshContext.jsx'

let mockState

vi.mock('../src/store/useBackofficeStore.js', () => ({
  CLIENT_PRICE: 300,
  useBackofficeStore: (selector) => selector(mockState),
}))

vi.mock('../src/hooks/useClients.js', () => ({
  useClients: () => ({
    clients: [],
    status: { isLoading: false, error: null, isMutating: false },
    reload: vi.fn(),
    createClient: vi.fn(),
    toggleClientService: vi.fn(),
  }),
}))

vi.mock('../src/hooks/useDashboardData.js', () => ({
  useDashboardData: () => ({
    expenses: [],
    status: { metrics: {}, resellers: {}, expenses: {} },
    reloadMetrics: vi.fn(),
    reloadResellers: vi.fn(),
    reloadExpenses: vi.fn(),
  }),
}))

vi.mock('../src/hooks/useDashboardMetrics.js', () => ({
  useDashboardMetrics: () => ({
    metrics: {
      totalClients: 0,
      pendingClients: 0,
      paidClients: 0,
      clientIncome: 0,
      resellerIncome: 0,
      totalExpenses: 0,
      internetCosts: 0,
      netEarnings: 0,
      totalDebtAmount: 0,
    },
    filteredClients: [],
    baseCosts: {},
  }),
}))

vi.mock('../src/hooks/useToast.js', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../src/components/dashboard/StatCard.jsx', () => ({
  default: () => <div data-testid="stat-card" />,
}))

vi.mock('../src/components/dashboard/EarningsCard.jsx', () => ({
  default: () => <div data-testid="earnings-card" />,
}))

vi.mock('../src/components/reports/FinancialSummary.jsx', () => ({
  default: () => <div data-testid="financial-summary" />,
}))

beforeEach(() => {
  mockState = {
    recordPayment: vi.fn(),
    periods: { selected: '2024-01', current: '2024-01', historyStart: '2023-01' },
    goToPreviousPeriod: vi.fn(),
    goToNextPeriod: vi.fn(),
    status: {
      initialize: { isLoading: false, error: null },
      payments: { isMutating: false },
    },
  }
})

describe('page skeletons', () => {
  it('renders the dashboard skeleton while initialization is in progress', async () => {
    const { default: DashboardPage } = await import('../src/pages/Dashboard.jsx')
    mockState.status.initialize.isLoading = true

    render(
      <BackofficeRefreshProvider value={{ isRefreshing: false }}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </BackofficeRefreshProvider>,
    )

    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument()
  })

  it('hides the dashboard skeleton after initialization completes', async () => {
    const { default: DashboardPage } = await import('../src/pages/Dashboard.jsx')
    mockState.status.initialize.isLoading = false

    render(
      <BackofficeRefreshProvider value={{ isRefreshing: false }}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </BackofficeRefreshProvider>,
    )

    expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()
    expect(screen.getByTestId('stat-card')).toBeInTheDocument()
    expect(screen.getByTestId('earnings-card')).toBeInTheDocument()
  })

  it('renders the reports skeleton while a manual refresh is in progress', async () => {
    const { default: ReportsPage } = await import('../src/pages/Reports.jsx')

    render(
      <BackofficeRefreshProvider value={{ isRefreshing: true }}>
        <ReportsPage />
      </BackofficeRefreshProvider>,
    )

    expect(screen.getByTestId('reports-skeleton')).toBeInTheDocument()
  })

  it('renders the reports content when not refreshing', async () => {
    const { default: ReportsPage } = await import('../src/pages/Reports.jsx')

    render(
      <BackofficeRefreshProvider value={{ isRefreshing: false }}>
        <ReportsPage />
      </BackofficeRefreshProvider>,
    )

    expect(screen.queryByTestId('reports-skeleton')).not.toBeInTheDocument()
    expect(screen.getByTestId('financial-summary')).toBeInTheDocument()
  })
})
