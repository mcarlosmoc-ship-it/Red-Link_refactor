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
const mockBulkAssignClientServices = vi.fn()
const mockDeleteClient = vi.fn()
const mockDeleteService = vi.fn()
const mockReload = vi.fn()
const mockImport = vi.fn()
let lastClientsListHandlers = {}

vi.mock('../src/store/useBackofficeStore.js', () => ({
  CLIENT_PRICE: 300,
  useBackofficeStore: (selector) => selector({ status: { initialize: { isLoading: false } } }),
}))

vi.mock('../src/hooks/useClients.js', () => ({
  useClients: () => ({
    clients: [
      {
        id: '1',
        name: 'Cliente Uno',
        location: 'Zona A',
        zoneId: 'A',
        monthlyFee: 450,
        services: [
          { id: 'service-1', name: 'Internet', status: 'active' },
        ],
        recentPayments: [],
      },
      {
        id: '2',
        name: 'Cliente Dos',
        location: 'Zona B',
        zoneId: 'B',
        monthlyFee: 450,
        services: [
          { id: 'service-2', name: 'Internet', status: 'suspended' },
        ],
        recentPayments: [],
      },
    ],
    status: { isLoading: false, isMutating: false, error: null },
    reload: mockReload,
    createClient: mockCreateClient,
    createClientService: mockCreateClientService,
    bulkAssignClientServices: mockBulkAssignClientServices,
    updateClientServiceStatus: mockUpdateServiceStatus,
    deleteClient: mockDeleteClient,
    importClients: mockImport,
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

vi.mock('../src/features/clients/ServicesAssignments.jsx', () => ({
  default: () => <div data-testid="services-assignments-mock" />,
}))

vi.mock('../src/features/clients/ClientsList.jsx', () => ({
  default: (props) => {
    lastClientsListHandlers = {
      onBulkAssignPlan: props.onBulkAssignPlan,
      onBulkChangeStatus: props.onBulkChangeStatus,
      onBulkDeleteClients: props.onBulkDeleteClients,
      servicePlans: props.servicePlans,
    }
    return <div data-testid="clients-list-mock">Listado de clientes</div>
  },
}))

vi.mock('../src/hooks/useToast.js', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  lastClientsListHandlers = {}
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

describe('ClientsPage bulk actions', () => {
  const renderPage = () =>
    render(
      <BackofficeRefreshProvider value={{ isRefreshing: false }}>
        <MemoryRouter>
          <ClientsPage />
        </MemoryRouter>
      </BackofficeRefreshProvider>,
    )

  it('asigna planes en lote y muestra conteos en el toast', async () => {
    mockBulkAssignClientServices.mockResolvedValueOnce([{ id: 'cs-1' }, { id: 'cs-2' }])
    renderPage()

    await lastClientsListHandlers.onBulkAssignPlan?.({ clientIds: ['1', '2'], servicePlanId: 'plan-1' })

    expect(mockBulkAssignClientServices).toHaveBeenCalledWith({
      clientIds: ['1', '2'],
      servicePlanId: 'plan-1',
      status: 'active',
    })

    const toastCall = mockShowToast.mock.calls.find(([payload]) => payload.title === 'Asignación de plan')
    expect(toastCall?.[0].description).toContain('2 de 2 clientes')
    expect(toastCall?.[0].type).toBe('success')
  })

  it('suspende servicios en lote reportando éxitos y errores', async () => {
    mockUpdateServiceStatus.mockResolvedValueOnce()
    mockUpdateServiceStatus.mockRejectedValueOnce(new Error('falló'))
    renderPage()

    await lastClientsListHandlers.onBulkChangeStatus?.(['1', '2'], 'suspended')

    expect(mockUpdateServiceStatus).toHaveBeenCalledWith('1', 'service-1', 'suspended')
    expect(mockUpdateServiceStatus).toHaveBeenCalledWith('2', 'service-2', 'suspended')

    const toastCall = mockShowToast.mock.calls.find(([payload]) => payload.title === 'Actualización masiva')
    expect(toastCall?.[0].description).toContain('1 de 2 clientes')
    expect(toastCall?.[0].description).toContain('1 con errores')
    expect(toastCall?.[0].type).toBe('warning')
  })

  it('elimina clientes en lote mostrando conteos de resultado', async () => {
    mockDeleteClient.mockResolvedValueOnce()
    mockDeleteClient.mockRejectedValueOnce(new Error('falló'))
    renderPage()

    await lastClientsListHandlers.onBulkDeleteClients?.(['1', '2'])

    expect(mockDeleteClient).toHaveBeenCalledWith('1')
    expect(mockDeleteClient).toHaveBeenCalledWith('2')

    const toastCall = mockShowToast.mock.calls.find(([payload]) => payload.title === 'Eliminación masiva')
    expect(toastCall?.[0].description).toContain('1 de 2 clientes')
    expect(toastCall?.[0].description).toContain('1 con errores')
    expect(toastCall?.[0].type).toBe('warning')
  })
})
