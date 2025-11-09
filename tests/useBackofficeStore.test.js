import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const postMock = vi.fn()
const getMock = vi.fn()
const patchMock = vi.fn()

vi.mock('../src/services/apiClient.js', () => ({
  apiClient: {
    post: postMock,
    get: getMock,
    patch: patchMock,
  },
}))

vi.mock('../src/services/queryClient.js', () => ({
  queryClient: {
    fetchQuery: vi.fn(),
    invalidateQueries: vi.fn(),
    getQueryData: vi.fn(),
    getQueryState: vi.fn(),
  },
}))

vi.mock('../src/store/utils/queryState.js', () => ({
  getCachedQueryData: vi.fn(),
  invalidateQuery: vi.fn(),
}))

let useBackofficeStore

beforeAll(async () => {
  ;({ useBackofficeStore } = await import('../src/store/useBackofficeStore.js'))
})

beforeEach(() => {
  vi.clearAllMocks()
  postMock.mockResolvedValue({ data: {} })

  useBackofficeStore.setState((state) => ({
    ...state,
    clients: [
      {
        id: 'client-1',
        name: 'Cliente sin tarifa',
        base: 1,
        location: 'Centro',
        service: 'Activo',
        monthlyFee: 0,
        services: [
          {
            id: 'service-1',
            name: 'Servicio general',
            status: 'active',
            price: 0,
          },
        ],
      },
    ],
    loadClients: vi.fn().mockResolvedValue([]),
    loadPayments: vi.fn().mockResolvedValue([]),
    loadMetrics: vi.fn().mockResolvedValue([]),
  }))
})

describe('useBackofficeStore.recordPayment', () => {
  it('envía al menos un mes cuando registra un monto positivo para un cliente sin tarifa', async () => {
    const { recordPayment } = useBackofficeStore.getState()

    await recordPayment({
      clientId: 'client-1',
      amount: 500,
      months: 0,
      method: 'Efectivo',
      note: '',
    })

    expect(postMock).toHaveBeenCalledWith(
      '/payments',
      expect.objectContaining({
        client_id: 'client-1',
        client_service_id: 'service-1',
        amount: 500,
        months_paid: 1,
      }),
    )
  })

  it('respeta los meses proporcionados explícitamente cuando la tarifa es cero', async () => {
    const { recordPayment } = useBackofficeStore.getState()

    await recordPayment({
      clientId: 'client-1',
      amount: 0,
      months: 3,
      method: 'Efectivo',
      note: '',
    })

    expect(postMock).toHaveBeenCalledWith(
      '/payments',
      expect.objectContaining({
        client_id: 'client-1',
        client_service_id: 'service-1',
        amount: 0,
        months_paid: 3,
      }),
    )
  })
})
