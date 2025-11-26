import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import ClientsPage from '../src/pages/Clients.jsx'
import { BackofficeRefreshProvider } from '../src/contexts/BackofficeRefreshContext.jsx'

const mockShowToast = vi.fn()
const mockCreateClient = vi.fn()
const mockCreateClientService = vi.fn()
const mockUpdateServiceStatus = vi.fn()
const mockDeleteClient = vi.fn()
const mockDeleteService = vi.fn()
const mockReload = vi.fn()

vi.mock('../src/store/useBackofficeStore.js', () => ({
  CLIENT_PRICE: 300,
  useBackofficeStore: (selector) => selector({ status: { initialize: { isLoading: false } } }),
}))

vi.mock('../src/hooks/useClients.js', () => ({
  useClients: () => ({
    clients: [
      {
        id: '1',
        name: 'Cliente de prueba',
        location: 'Nuevo Amatenango',
        zoneId: 'A',
        monthlyFee: 450,
        services: [
          { id: 'service-1', name: 'Internet', status: 'active' },
        ],
        recentPayments: [],
      },
    ],
    status: { isLoading: false, error: null },
    reload: mockReload,
    createClient: mockCreateClient,
    createClientService: mockCreateClientService,
    updateClientServiceStatus: mockUpdateServiceStatus,
    deleteClient: mockDeleteClient,
  }),
}))

vi.mock('../src/hooks/useServicePlans.js', () => ({
  useServicePlans: () => ({
    servicePlans: [{ id: 'plan-1', name: 'Plan Básico', serviceType: 'internet' }],
    status: { isLoading: false },
  }),
}))

vi.mock('../src/hooks/useClientServices.js', () => ({
  useClientServices: () => ({ deleteClientService: mockDeleteService }),
}))

vi.mock('../src/hooks/useToast.js', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ClientsPage layout', () => {
  it('renderiza secciones principales', async () => {
    const { container } = render(
      <BackofficeRefreshProvider value={{ isRefreshing: false }}>
        <MemoryRouter>
          <ClientsPage />
        </MemoryRouter>
      </BackofficeRefreshProvider>,
    )

    expect(container.innerHTML).toContain('Listado de clientes')
    expect(container.innerHTML).toContain('Agregar cliente')
    expect(container.innerHTML).toContain('Servicios')
  })
})
