import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const postMock = vi.fn()
const patchMock = vi.fn()
const putMock = vi.fn()
const deleteMock = vi.fn()

vi.mock('../src/services/apiClient.js', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
    patch: patchMock,
    put: putMock,
    delete: deleteMock,
  },
}))

const fetchQueryMock = vi.fn()
const invalidateQueriesMock = vi.fn()
const getQueryDataMock = vi.fn()
const getQueryStateMock = vi.fn()

vi.mock('../src/services/queryClient.js', () => ({
  queryClient: {
    fetchQuery: fetchQueryMock,
    invalidateQueries: invalidateQueriesMock,
    getQueryData: getQueryDataMock,
    getQueryState: getQueryStateMock,
  },
}))

vi.mock('../src/hooks/useToast.js', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}))

const createDeferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const setStatusIdle = (status) => ({
  ...status,
  isLoading: false,
  isMutating: false,
  lastFetchedAt: null,
})

let forcedInitializing = null

describe('initialize + hooks request coordination', () => {
  beforeEach(() => {
    forcedInitializing = null
    vi.resetModules()
    vi.clearAllMocks()
    vi.doMock('react', async (importOriginal) => {
      const actual = await importOriginal()
      return {
        ...actual,
        useEffect: (effect) => {
          Promise.resolve().then(() => {
            const cleanup = effect()
            if (typeof cleanup === 'function') {
              cleanup()
            }
          })
        },
      }
    })
    vi.doMock('../src/store/useBackofficeStore.js', async (importOriginal) => {
      const actual = await importOriginal()
      const actualStore = actual.useBackofficeStore
      const wrappedStore = (selector) =>
        actualStore((state) =>
          selector({
            ...state,
            isInitializingResources:
              forcedInitializing ?? state.isInitializingResources,
          }),
        )
      Object.assign(wrappedStore, actualStore)
      return { ...actual, useBackofficeStore: wrappedStore }
    })
    fetchQueryMock.mockImplementation(async ({ queryFn }) => queryFn())
    getQueryDataMock.mockReturnValue(undefined)
    getQueryStateMock.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.doUnmock('react')
    forcedInitializing = null
  })

  it('calls each initialization endpoint at most once when hooks mount', async () => {
    const callRecords = []
    const pendingRequests = []

    const payloadsByEndpoint = {
      '/clients': { data: { items: [] } },
      '/client-services': { data: { items: [] } },
      '/payments': { data: { items: [] } },
      '/resellers': [],
      '/expenses': { data: { items: [] } },
      '/inventory': { data: { items: [] } },
      '/metrics/dashboard': { data: { summary: {}, clients: [], base_costs: {} } },
    }

    getMock.mockImplementation((endpoint, options) => {
      const deferred = createDeferred()
      callRecords.push({ endpoint, options })
      pendingRequests.push({ endpoint, deferred })
      return deferred.promise
    })

    const React = await import('react')
    const { createElement } = React
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { useBackofficeStore } = await import('../src/store/useBackofficeStore.js')
    const { useClients } = await import('../src/hooks/useClients.js')
    const { useDashboardData } = await import('../src/hooks/useDashboardData.js')

    const store = useBackofficeStore

    store.setState((state) => ({
      ...state,
      isInitializingResources: true,
    }))

    forcedInitializing = true

    const {
      loadClients,
      loadClientServices,
      loadPayments,
      loadResellers,
      loadExpenses,
      loadInventory,
      loadMetrics,
    } = store.getState()

    loadClients({ force: false, retries: 1 })
    loadClientServices({ force: false, retries: 1 })
    loadPayments({ force: false, retries: 1 })
    loadResellers({ force: false, retries: 1 })
    loadExpenses({ force: false, retries: 1 })
    loadInventory({ force: false, retries: 1 })

    store.setState((state) => ({
      ...state,
      status: {
        ...state.status,
        clients: setStatusIdle(state.status.clients),
        payments: setStatusIdle(state.status.payments),
        resellers: setStatusIdle(state.status.resellers),
        expenses: setStatusIdle(state.status.expenses),
        inventory: setStatusIdle(state.status.inventory),
        metrics: setStatusIdle(state.status.metrics),
      },
    }))

    const HookProbe = () => {
      useClients()
      useDashboardData()
      return null
    }

    renderToStaticMarkup(createElement(HookProbe))

    await Promise.resolve()

    const flushPendingRequests = async () => {
      while (pendingRequests.length > 0) {
        const request = pendingRequests.shift()
        const payload = payloadsByEndpoint[request.endpoint]
        expect(payload).toBeDefined()
        request.deferred.resolve(payload)
      }
      await Promise.resolve()
      if (pendingRequests.length > 0) {
        await flushPendingRequests()
      }
    }

    await flushPendingRequests()

    loadMetrics({ force: false, retries: 1 })

    await flushPendingRequests()

    store.setState((state) => ({
      ...state,
      isInitializingResources: false,
    }))
    forcedInitializing = null

    await flushPendingRequests()

    const relevantEndpoints = ['/clients', '/payments', '/inventory', '/expenses', '/resellers']

    const callsByEndpoint = relevantEndpoints.reduce((acc, endpoint) => {
      acc[endpoint] = callRecords.filter((record) => record.endpoint === endpoint)
      return acc
    }, {})

    for (const endpoint of relevantEndpoints) {
      const calls = callsByEndpoint[endpoint]
      expect(calls).toHaveLength(1)

      if (endpoint === '/resellers') {
        expect(calls[0].options).toBeUndefined()
      } else if (endpoint === '/payments') {
        expect(calls[0].options).toMatchObject({
          query: expect.objectContaining({
            limit: 200,
          }),
        })
      } else {
        expect(calls[0].options).toEqual({ query: { limit: 200 } })
      }
    }
  })
})
