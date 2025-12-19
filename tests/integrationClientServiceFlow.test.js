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
  postMock.mockImplementation((url, body) => {
    if (url === '/clients') {
      return Promise.resolve({ data: { ...body, id: 'client-99', services: [] } })
    }

    if (url === '/client-services') {
      const monthlyPrice = body.custom_price ?? 550
      return Promise.resolve({
        data: {
          id: 'service-99',
          client_id: body.client_id,
          ip_address: body.ip_address ?? null,
          service_plan: {
            id: body.service_plan_id,
            name: 'Plan de prueba',
            category: 'internet',
            monthly_price: monthlyPrice,
            requires_ip: false,
            requires_base: false,
            capacity_type: 'unlimited',
            status: 'active',
          },
          custom_price: body.custom_price,
          effective_price: monthlyPrice,
          billing_day: body.billing_day ?? 1,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      })
    }

    if (url === '/payments') {
      return Promise.resolve({
        data: {
          id: 'payment-99',
          client_id: body.client_id,
          client_service_id: body.client_service_id,
          amount: body.amount,
          months_paid: body.months_paid,
        },
      })
    }

    return Promise.resolve({ data: {} })
  })

  useBackofficeStore.setState((state) => ({
    ...state,
    clients: [],
    loadClients: vi.fn().mockResolvedValue([]),
    loadClientServices: vi.fn().mockResolvedValue([]),
    loadMetrics: vi.fn().mockResolvedValue([]),
  }))
})

describe('flujo de alta con servicio y pago', () => {
  it('propaga la tarifa del servicio a los pagos registrados', async () => {
    const { createClient, createClientService, recordPayment } = useBackofficeStore.getState()

    const createdClient = await createClient({
      type: 'residential',
      name: 'Cliente nuevo',
      location: 'Centro',
      zoneId: 1,
    })

    expect(postMock).toHaveBeenCalledWith(
      '/clients',
      expect.not.objectContaining({ services: expect.anything() }),
    )

    const createdService = await createClientService({
      clientId: createdClient.id,
      servicePlanId: 99,
      customPrice: 575,
      billingDay: 5,
      status: 'active',
    })

    expect(createdService.price).toBe(575)

    useBackofficeStore.setState((state) => ({
      ...state,
      clients: [
        {
          ...createdClient,
          services: [createdService],
          monthlyFee: createdService.price,
        },
      ],
    }))

    await recordPayment({
      clientId: createdClient.id,
      serviceId: createdService.id,
      amount: 575,
      months: 1,
      method: 'Efectivo',
      note: '',
    })

    expect(postMock).toHaveBeenCalledWith(
      '/payments',
      expect.objectContaining({
        amount: 575,
        months_paid: 1,
        client_id: createdClient.id,
        client_service_id: createdService.id,
      }),
    )
  })

  it('crea cliente, asigna servicio y registra la IP del servicio', async () => {
    const { createClient, createClientService } = useBackofficeStore.getState()

    const createdClient = await createClient({
      type: 'residential',
      name: 'Cliente con IP',
      location: 'Norte',
      zoneId: 2,
    })

    const createdService = await createClientService({
      clientId: createdClient.id,
      servicePlanId: 101,
      ipAddress: '192.168.10.45',
      billingDay: 10,
      status: 'active',
    })

    expect(postMock).toHaveBeenCalledWith(
      '/client-services',
      expect.objectContaining({
        client_id: createdClient.id,
        service_plan_id: 101,
        ip_address: '192.168.10.45',
      }),
    )
    expect(createdService.ipAddress).toBe('192.168.10.45')
  })
})
