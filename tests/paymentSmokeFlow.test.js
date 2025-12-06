import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

const postMock = vi.fn()
const getMock = vi.fn()
const fetchQueryMock = vi.fn()

vi.mock('../src/services/apiClient.js', () => ({
  apiClient: {
    post: postMock,
    get: getMock,
  },
}))

vi.mock('../src/services/queryClient.js', () => ({
  queryClient: {
    fetchQuery: fetchQueryMock,
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

  useBackofficeStore.setState((state) => ({
    ...state,
    clients: [
      {
        id: 'client-1',
        name: 'Cliente Dashboard',
        location: 'Centro',
        base: 1,
        service: 'Activo',
        monthlyFee: 300,
        debtMonths: 0,
        paidMonthsAhead: 0,
        services: [
          {
            id: 'service-1',
            clientId: 'client-1',
            servicePlanId: 10,
            price: 300,
            status: 'active',
            name: 'Internet',
          },
        ],
        recentPayments: [],
      },
    ],
  }))

  postMock.mockImplementation((url, body) => {
    if (url === '/payments') {
      return Promise.resolve({
        data: {
          id: 'payment-xyz',
          client_id: body.client_id,
          client_service_id: body.client_service_id,
          amount: body.amount,
          months_paid: body.months_paid,
        },
      })
    }

    return Promise.resolve({ data: {} })
  })

  getMock.mockImplementation((url) => {
    if (url === '/clients') {
      return Promise.resolve({
        data: {
          items: [
            {
              id: 'client-1',
              client_type: 'residential',
              full_name: 'Cliente Dashboard',
              location: 'Centro',
              base_id: 1,
              debt_months: 0,
              paid_months_ahead: 0,
              service_status: 'active',
              services: [
                {
                  id: 'service-1',
                  client_id: 'client-1',
                  service_plan_id: 10,
                  status: 'active',
                  service_plan: {
                    id: 10,
                    name: 'Internet',
                    category: 'internet',
                    monthly_price: 300,
                  },
                },
              ],
              recent_payments: [
                {
                  id: 'payment-xyz',
                  paid_on: '2024-01-10',
                  amount: 120,
                  months_paid: 1,
                  method: 'Efectivo',
                  client_service_id: 'service-1',
                  client_id: 'client-1',
                  service: {
                    id: 'service-1',
                    service_plan: {
                      name: 'Internet',
                      category: 'internet',
                    },
                  },
                },
              ],
            },
          ],
        },
      })
    }

    if (url === '/payments') {
      return Promise.resolve({ data: { items: [] } })
    }

    if (url === '/metrics/dashboard') {
      return Promise.resolve({ data: { summary: {}, clients: [], base_costs: {} } })
    }

    if (url === '/metrics/consistency/payments') {
      return Promise.resolve({
        data: {
          client_counters: [],
          service_counters: [],
          payments_without_service: [],
          payments_with_mismatched_client: [],
          services_without_client: [],
        },
      })
    }

    return Promise.resolve({ data: {} })
  })

  fetchQueryMock.mockImplementation(async ({ queryKey, queryFn }) => {
    const rootKey = Array.isArray(queryKey) ? queryKey[0] : queryKey

    if (rootKey === 'clients') {
      return queryFn()
    }

    if (rootKey === 'payments') {
      return []
    }

    if (rootKey === 'metrics') {
      return { summary: {}, clients: [], base_costs: {} }
    }

    return queryFn ? queryFn() : []
  })
})

describe('Smoke de pagos desde dashboard', () => {
  it('crea un pago y se refleja en los pagos recientes del cliente', async () => {
    const { recordPayment } = useBackofficeStore.getState()

    await recordPayment({
      clientId: 'client-1',
      serviceId: 'service-1',
      amount: 120,
      months: 1,
      method: 'Efectivo',
      note: '',
    })

    const [client] = useBackofficeStore.getState().clients
    expect(client.recentPayments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'payment-xyz', serviceId: 'service-1' }),
      ]),
    )
    expect(postMock).toHaveBeenCalledWith(
      '/payments',
      expect.objectContaining({ client_service_id: 'service-1', client_id: 'client-1' }),
    )

    const consistency = await useBackofficeStore.getState().checkPaymentsConsistency()
    expect(consistency).toMatchObject({
      client_counters: [],
      payments_without_service: [],
    })
    expect(getMock).toHaveBeenCalledWith('/metrics/consistency/payments')
  })
})
