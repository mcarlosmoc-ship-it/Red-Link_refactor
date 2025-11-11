import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import { BackofficeRefreshProvider } from '../src/contexts/BackofficeRefreshContext.jsx'

let mockStoreState

vi.mock('../src/store/useBackofficeStore.js', () => ({
  CLIENT_PRICE: 300,
  useBackofficeStore: (selector) => selector(mockStoreState),
}))

vi.mock('../src/hooks/useClients.js', () => ({
  useClients: () => ({
    clients: [
      {
        id: '1',
        name: 'Cliente de prueba',
        location: 'Nuevo Amatenango',
        type: 'residential',
        services: [],
        recentPayments: [],
        monthlyFee: 450,
        debtMonths: 0,
        paidMonthsAhead: 0,
      },
    ],
    status: { isLoading: false, error: null, isMutating: false },
    reload: vi.fn(),
    createClient: vi.fn(),
    createClientService: vi.fn(),
    bulkAssignClientServices: vi.fn(),
    updateClientServiceStatus: vi.fn(),
    deleteClient: vi.fn(),
    importClients: vi.fn(),
  }),
}))

vi.mock('../src/hooks/useServicePlans.js', () => ({
  useServicePlans: () => ({
    servicePlans: [
      {
        id: 1,
        name: 'Plan Básico',
        isActive: true,
        serviceType: 'internet',
        requiresIp: false,
        requiresBase: false,
        defaultMonthlyFee: 450,
      },
    ],
    status: {},
    isLoading: false,
  }),
}))

vi.mock('../src/hooks/useToast.js', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../src/components/clients/ImportClientsModal.jsx', () => ({
  default: () => <div data-testid="import-clients-modal" />,
}))

vi.mock('../src/components/clients/BulkAssignServicesModal.jsx', () => ({
  default: () => <div data-testid="bulk-assign-modal" />,
}))

vi.mock('../src/pages/MonthlyServices.jsx', () => ({
  default: () => <div data-testid="monthly-services" />,
}))

beforeEach(() => {
  mockStoreState = {
    initializeStatus: { isLoading: false, error: null },
    selectedPeriod: '2024-01',
    currentPeriod: '2024-01',
    status: {
      initialize: { isLoading: false },
    },
    periods: {
      selected: '2024-01',
      current: '2024-01',
    },
  }
})

describe('ClientsPage', () => {
  it('renders the clients list without crashing', async () => {
    const { default: ClientsPage } = await import('../src/pages/Clients.jsx')

    const { container } = render(
      <BackofficeRefreshProvider value={{ isRefreshing: false }}>
        <MemoryRouter>
          <ClientsPage />
        </MemoryRouter>
      </BackofficeRefreshProvider>,
    )

    expect(container.innerHTML).toContain('Listado de clientes')
    expect(container.innerHTML).toContain('Cliente de prueba')
  })
})
