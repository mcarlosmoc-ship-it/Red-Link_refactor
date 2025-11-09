import { create } from 'zustand'
import { today } from '../utils/formatters.js'
import { apiClient } from '../services/apiClient.js'
import { queryClient } from '../services/queryClient.js'
import { queryKeys } from '../services/queryKeys.js'
import {
  CLIENT_PRICE,
  INVENTORY_IP_RANGES,
  DEFAULT_VOUCHER_PRICES,
  RESOURCE_TTL_MS,
} from './constants.js'
import {
  mapClient,
  mapClientService,
  mapPayment,
  mapExpense,
  mapInventoryItem,
  mapReseller,
  mapPrincipalAccount,
  mapClientAccount,
  serializeClientPayload,
  serializeClientAccountPayload,
  convertBaseCosts,
  VOUCHER_TYPE_IDS,
} from './mappers/index.js'
import {
  createInitialPeriods,
  syncPeriods,
  selectPeriod as selectPeriodState,
  goToPreviousPeriod as selectPreviousPeriod,
  goToNextPeriod as selectNextPeriod,
} from './utils/periods.js'
import {
  createInitialStatus,
  runMutation,
  runWithStatus,
  setStatus,
} from './utils/status.js'
import { getCachedQueryData, invalidateQuery } from './utils/queryState.js'
import { normalizeDecimal, normalizeTextOrNull } from './utils/normalizers.js'

export { CLIENT_PRICE, INVENTORY_IP_RANGES } from './constants.js'

const MUTABLE_SERVICE_STATUSES = new Set(['active', 'suspended'])

const createInitialState = () => ({
  clients: [],
  principalAccounts: [],
  clientAccounts: [],
  payments: [],
  resellers: [],
  expenses: [],
  inventory: [],
  baseCosts: {},
  voucherPrices: { ...DEFAULT_VOUCHER_PRICES },
  periods: createInitialPeriods(),
  metrics: null,
  metricsPeriodKey: null,
  metricsFilters: { statusFilter: 'all', searchTerm: '' },
  dashboardClients: [],
  paymentsPeriodKey: null,
  status: createInitialStatus(),
})

const updateMetricsState = (set, data, periodKey, filters) => {
  if (!data) {
    return
  }
  set({
    metrics: data.summary,
    dashboardClients: data.clients,
    baseCosts: convertBaseCosts(data.base_costs),
    metricsPeriodKey: periodKey,
    metricsFilters: filters,
  })
}

export const useBackofficeStore = create((set, get) => ({
  ...createInitialState(),
  clearResourceError: (resource) => {
    if (!resource || !get().status?.[resource]) {
      return
    }
    setStatus(set, resource, { error: null, errorCode: null })
  },
  syncCurrentPeriod: () =>
    set((state) => ({
      periods: syncPeriods(state.periods),
    })),
  setSelectedPeriod: (periodKey) =>
    set((state) => ({
      periods: selectPeriodState(state.periods, periodKey),
    })),
  goToPreviousPeriod: () =>
    set((state) => ({
      periods: selectPreviousPeriod(state.periods),
    })),
  goToNextPeriod: () =>
    set((state) => ({
      periods: selectNextPeriod(state.periods),
    })),
  loadClients: async ({ force = false, retries = 1 } = {}) => {
    const queryKey = queryKeys.clients()

    if (force) {
      invalidateQuery(queryKey)
    } else {
      const cached = getCachedQueryData(queryKey, { ttl: RESOURCE_TTL_MS })
      if (cached) {
        set({ clients: cached })
        return cached
      }
    }

    return runWithStatus({
      set,
      get,
      resource: 'clients',
      retries,
      action: async () => {
        const data = await queryClient.fetchQuery({
          queryKey,
          queryFn: async () => {
            const response = await apiClient.get('/clients', {
              query: { limit: 200 },
            })
            const payload = response.data
            const items = Array.isArray(payload?.items)
              ? payload.items
              : Array.isArray(payload)
                ? payload
                : []
            return items.map(mapClient)
          },
          staleTime: RESOURCE_TTL_MS,
          force,
        })
        set({ clients: data })
        return data
      },
    })
  },
  loadPrincipalAccounts: async ({ force = false, retries = 1 } = {}) => {
    const queryKey = queryKeys.principalAccounts()

    if (force) {
      invalidateQuery(queryKey)
    } else {
      const cached = getCachedQueryData(queryKey, { ttl: RESOURCE_TTL_MS })
      if (cached) {
        set({ principalAccounts: cached })
        return cached
      }
    }

    return runWithStatus({
      set,
      get,
      resource: 'principalAccounts',
      retries,
      action: async () => {
        const data = await queryClient.fetchQuery({
          queryKey,
          queryFn: async () => {
            const response = await apiClient.get('/principal-accounts', {
              query: { limit: 200 },
            })
            const payload = response.data
            const items = Array.isArray(payload?.items)
              ? payload.items
              : Array.isArray(payload)
                ? payload
                : []
            return items.map(mapPrincipalAccount)
          },
          staleTime: RESOURCE_TTL_MS,
          force,
        })
        set({ principalAccounts: data })
        return data
      },
    })
  },
  loadClientAccounts: async ({ force = false, retries = 1 } = {}) => {
    const queryKey = queryKeys.clientAccounts()

    if (force) {
      invalidateQuery(queryKey)
    } else {
      const cached = getCachedQueryData(queryKey, { ttl: RESOURCE_TTL_MS })
      if (cached) {
        set({ clientAccounts: cached })
        return cached
      }
    }

    return runWithStatus({
      set,
      get,
      resource: 'clientAccounts',
      retries,
      action: async () => {
        const data = await queryClient.fetchQuery({
          queryKey,
          queryFn: async () => {
            const response = await apiClient.get('/client-accounts', {
              query: { limit: 500 },
            })
            const payload = response.data
            const items = Array.isArray(payload?.items)
              ? payload.items
              : Array.isArray(payload)
                ? payload
                : []
            return items.map(mapClientAccount)
          },
          staleTime: RESOURCE_TTL_MS,
          force,
        })
        set({ clientAccounts: data })
        return data
      },
    })
  },
  loadPayments: async ({ force = false, retries = 1, periodKey } = {}) => {
    const targetPeriod = periodKey ?? get().paymentsPeriodKey ?? get().periods?.selected
    const queryKey = queryKeys.payments(targetPeriod)

    if (force) {
      invalidateQuery(queryKey)
    } else {
      const cached = getCachedQueryData(queryKey, { ttl: RESOURCE_TTL_MS })
      if (cached) {
        set({ payments: cached, paymentsPeriodKey: targetPeriod ?? null })
        return cached
      }
    }

    return runWithStatus({
      set,
      get,
      resource: 'payments',
      retries,
      action: async () => {
        const data = await queryClient.fetchQuery({
          queryKey,
          queryFn: async () => {
            const query = {
              query: {
                ...(targetPeriod ? { period_key: targetPeriod } : {}),
                limit: 200,
              },
            }
            const response = await apiClient.get('/payments', query)
            const payload = response.data
            const items = Array.isArray(payload?.items)
              ? payload.items
              : Array.isArray(payload)
                ? payload
                : []
            return items.map(mapPayment)
          },
          staleTime: RESOURCE_TTL_MS,
          force,
        })
        set({ payments: data, paymentsPeriodKey: targetPeriod ?? null })
        return data
      },
    })
  },
  loadResellers: async ({ force = false, retries = 1 } = {}) => {
    const queryKey = queryKeys.resellers()

    if (force) {
      invalidateQuery(queryKey)
    } else {
      const cached = getCachedQueryData(queryKey, { ttl: RESOURCE_TTL_MS })
      if (cached) {
        set({ resellers: cached })
        return cached
      }
    }

    return runWithStatus({
      set,
      get,
      resource: 'resellers',
      retries,
      action: async () => {
        const data = await queryClient.fetchQuery({
          queryKey,
          queryFn: async () => {
            const response = await apiClient.get('/resellers')
            return response.data.map(mapReseller)
          },
          staleTime: RESOURCE_TTL_MS,
          force,
        })
        set({ resellers: data })
        return data
      },
    })
  },
  loadExpenses: async ({ force = false, retries = 1 } = {}) => {
    const queryKey = queryKeys.expenses()

    if (force) {
      invalidateQuery(queryKey)
    } else {
      const cached = getCachedQueryData(queryKey, { ttl: RESOURCE_TTL_MS })
      if (cached) {
        set({ expenses: cached })
        return cached
      }
    }

    return runWithStatus({
      set,
      get,
      resource: 'expenses',
      retries,
      action: async () => {
        const data = await queryClient.fetchQuery({
          queryKey,
          queryFn: async () => {
            const response = await apiClient.get('/expenses', {
              query: { limit: 200 },
            })
            const payload = response.data
            const items = Array.isArray(payload?.items)
              ? payload.items
              : Array.isArray(payload)
                ? payload
                : []
            return items.map(mapExpense)
          },
          staleTime: RESOURCE_TTL_MS,
          force,
        })
        set({ expenses: data })
        return data
      },
    })
  },
  loadInventory: async ({ force = false, retries = 1 } = {}) => {
    const queryKey = queryKeys.inventory()

    if (force) {
      invalidateQuery(queryKey)
    } else {
      const cached = getCachedQueryData(queryKey, { ttl: RESOURCE_TTL_MS })
      if (cached) {
        set({ inventory: cached })
        return cached
      }
    }

    return runWithStatus({
      set,
      get,
      resource: 'inventory',
      retries,
      action: async () => {
        const data = await queryClient.fetchQuery({
          queryKey,
          queryFn: async () => {
            const response = await apiClient.get('/inventory', {
              query: { limit: 200 },
            })
            const payload = response.data
            const items = Array.isArray(payload?.items)
              ? payload.items
              : Array.isArray(payload)
                ? payload
                : []
            return items.map(mapInventoryItem)
          },
          staleTime: RESOURCE_TTL_MS,
          force,
        })
        set({ inventory: data })
        return data
      },
    })
  },
  loadMetrics: async ({
    force = false,
    retries = 1,
    periodKey,
    statusFilter,
    searchTerm,
    currentPeriod,
  } = {}) => {
    const periods = get().periods ?? createInitialPeriods()
    const targetPeriod = periodKey ?? periods.selected ?? periods.current
    const previousFilters = get().metricsFilters ?? { statusFilter: 'all', searchTerm: '' }
    const normalizedFilters = {
      statusFilter: statusFilter ?? previousFilters.statusFilter ?? 'all',
      searchTerm: (searchTerm ?? previousFilters.searchTerm ?? '').trim(),
    }
    const effectiveCurrentPeriod = currentPeriod ?? periods.current ?? targetPeriod
    const queryKey = queryKeys.metrics({
      periodKey: targetPeriod,
      statusFilter: normalizedFilters.statusFilter,
      searchTerm: normalizedFilters.searchTerm,
      currentPeriod: effectiveCurrentPeriod,
    })

    if (force) {
      invalidateQuery(queryKey)
    } else {
      const cached = getCachedQueryData(queryKey, { ttl: RESOURCE_TTL_MS })
      if (cached) {
        updateMetricsState(set, cached, targetPeriod ?? null, normalizedFilters)
        return cached
      }
    }

    return runWithStatus({
      set,
      get,
      resource: 'metrics',
      retries,
      action: async () => {
        const data = await queryClient.fetchQuery({
          queryKey,
          queryFn: async () => {
            const response = await apiClient.get('/metrics/dashboard', {
              query: {
                period_key: targetPeriod,
                current_period: effectiveCurrentPeriod,
                status_filter: normalizedFilters.statusFilter,
                search: normalizedFilters.searchTerm || undefined,
              },
            })
            return response.data
          },
          staleTime: RESOURCE_TTL_MS,
          force,
        })
        updateMetricsState(set, data, targetPeriod ?? null, normalizedFilters)
        return data
      },
    })
  },
  initialize: async ({ force = false } = {}) =>
    runWithStatus({
      set,
      get,
      resource: 'initialize',
      updateTimestamp: false,
      action: async () => {
        await Promise.all([
          get().loadClients({ force, retries: 1 }),
          get().loadPayments({ force, retries: 1 }),
          get().loadResellers({ force, retries: 1 }),
          get().loadExpenses({ force, retries: 1 }),
          get().loadInventory({ force, retries: 1 }),
        ])
        await get().loadMetrics({ force, retries: 1 })
      },
    }),
  refreshData: async ({ silent = false } = {}) => {
    try {
      await get().initialize({ force: true })
    } catch (error) {
      if (!silent) {
        throw error
      }
    }
  },
  createClient: async (payload) => {
    await runMutation({
      set,
      resources: 'clients',
      action: async () => {
        await apiClient.post('/clients', serializeClientPayload(payload))
      },
    })

    invalidateQuery(queryKeys.clients())
    invalidateQuery(['metrics'])

    await Promise.all([
      get().loadClients({ force: true, retries: 1 }),
      get().loadMetrics({ force: true, retries: 1 }),
    ])
  },
  createClientAccount: async (payload) => {
    await runMutation({
      set,
      resources: ['clientAccounts', 'principalAccounts'],
      action: async () => {
        await apiClient.post('/client-accounts', serializeClientAccountPayload(payload))
      },
    })

    invalidateQuery(queryKeys.clientAccounts())
    invalidateQuery(queryKeys.principalAccounts())

    await Promise.all([
      get().loadClientAccounts({ force: true, retries: 1 }),
      get().loadPrincipalAccounts({ force: true, retries: 1 }),
    ])
  },
  registerClientAccountPayment: async ({
    clientAccountId,
    amount,
    paymentDate,
    method,
    period,
    notes,
  }) => {
    await runMutation({
      set,
      resources: 'clientAccounts',
      action: async () => {
        await apiClient.post(`/client-accounts/${clientAccountId}/payments`, {
          monto: amount,
          fecha_pago: paymentDate,
          metodo_pago: method ?? 'Transferencia',
          periodo_correspondiente: period ?? null,
          notas: notes ?? null,
        })
      },
    })

    invalidateQuery(queryKeys.clientAccounts())

    await get().loadClientAccounts({ force: true, retries: 1 })
  },
  updateClientAccountPassword: async ({ clientAccountId, password }) => {
    await runMutation({
      set,
      resources: 'clientAccounts',
      action: async () => {
        await apiClient.put(`/client-accounts/${clientAccountId}`, {
          contrasena_cliente: password,
        })
      },
    })

    invalidateQuery(queryKeys.clientAccounts())

    await get().loadClientAccounts({ force: true, retries: 1 })
  },
  importClients: async (file) => {
    if (!file || typeof file.text !== 'function') {
      throw new Error('Selecciona un archivo CSV válido.')
    }

    const content = await file.text()
    const payload = {
      filename: typeof file.name === 'string' ? file.name : undefined,
      content,
    }

    const summary = await runMutation({
      set,
      resources: 'clients',
      action: async () => {
        const response = await apiClient.post('/clients/import', payload)
        return response.data
      },
    })

    invalidateQuery(queryKeys.clients())
    invalidateQuery(['metrics'])

    await Promise.all([
      get().loadClients({ force: true, retries: 1 }),
      get().loadMetrics({ force: true, retries: 1 }),
    ])

    return summary
  },
  createReseller: async ({ name, base, location }) => {
    await runMutation({
      set,
      resources: 'resellers',
      action: async () => {
        await apiClient.post('/resellers', {
          full_name: name.trim(),
          base_id: Number(base) || 1,
          location: location.trim(),
        })
      },
    })

    invalidateQuery(queryKeys.resellers())
    await get().loadResellers({ force: true, retries: 1 })
  },
  deleteClient: async (clientId) => {
    const state = get()
    const client = state.clients.find((item) => String(item.id) === String(clientId))

    if (!client) {
      throw new Error('Cliente no encontrado')
    }

    const normalizedClientId = String(client.id ?? clientId)

    await runMutation({
      set,
      resources: 'clients',
      action: async () => {
        await apiClient.delete(`/clients/${normalizedClientId}`)
      },
    })

    invalidateQuery(queryKeys.clients())
    invalidateQuery(['metrics'])

    await Promise.all([
      get().loadClients({ force: true, retries: 1 }),
      get().loadMetrics({ force: true, retries: 1 }),
    ])
  },
  updateClientServiceStatus: async (clientId, serviceId, status) => {
    const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : ''

    if (!MUTABLE_SERVICE_STATUSES.has(normalizedStatus)) {
      throw new Error('Selecciona un estado válido para actualizar el servicio')
    }

    const state = get()
    const client = state.clients.find((item) => String(item.id) === String(clientId))

    if (!client) {
      throw new Error('Cliente no encontrado')
    }

    const availableServices = Array.isArray(client.services) ? client.services : []

    if (availableServices.length === 0) {
      throw new Error('El cliente no tiene servicios asociados')
    }

    const normalizedServiceId = serviceId ?? availableServices[0]?.id ?? null
    const targetService = availableServices.find(
      (service) => String(service.id) === String(normalizedServiceId),
    )

    if (!targetService) {
      throw new Error('Selecciona un servicio válido para actualizar')
    }

    if (targetService.status === normalizedStatus) {
      return normalizedStatus
    }

    await runMutation({
      set,
      resources: 'clients',
      action: async () => {
        await apiClient.put(`/client-services/${targetService.id}`, {
          status: normalizedStatus,
        })
      },
    })

    invalidateQuery(queryKeys.clients())
    invalidateQuery(['metrics'])

    await Promise.all([
      get().loadClients({ force: true, retries: 1 }),
      get().loadMetrics({ force: true, retries: 1 }),
    ])

    return normalizedStatus
  },
  toggleClientService: async (clientId, serviceId) => {
    const state = get()
    const client = state.clients.find((item) => String(item.id) === String(clientId))

    if (!client) {
      throw new Error('Cliente no encontrado')
    }

    const availableServices = Array.isArray(client.services) ? client.services : []
    const normalizedServiceId = serviceId ?? availableServices[0]?.id ?? null
    const targetService = availableServices.find(
      (service) => String(service.id) === String(normalizedServiceId),
    )

    if (!targetService) {
      throw new Error('El cliente no tiene servicios asociados')
    }

    const nextStatus = targetService.status === 'active' ? 'suspended' : 'active'

    return get().updateClientServiceStatus(clientId, targetService.id, nextStatus)
  },
  recordPayment: async ({ clientId, serviceId, months, amount, method, note, periodKey, paidOn }) => {
    const state = get()
    const client = state.clients.find((item) => String(item.id) === String(clientId))
    if (!client) {
      throw new Error('Cliente no encontrado')
    }

    const availableServices = Array.isArray(client.services) ? client.services : []
    const normalizedServiceId = serviceId ?? availableServices[0]?.id ?? null

    const service = availableServices.find(
      (item) => String(item.id) === String(normalizedServiceId),
    )

    if (availableServices.length > 0 && !service) {
      throw new Error('Selecciona un servicio válido para registrar el pago')
    }

    const monthlyFee = service?.price ?? client?.monthlyFee ?? CLIENT_PRICE
    const normalizedMonths = normalizeDecimal(months, 0)
    const normalizedAmount = normalizeDecimal(amount, 0)

    const computedAmount = normalizedAmount > 0 ? normalizedAmount : normalizedMonths * monthlyFee
    const computedMonths = (() => {
      if (normalizedMonths > 0) {
        return normalizedMonths
      }

      if (monthlyFee > 0) {
        const monthsFromAmount = computedAmount / monthlyFee
        return monthsFromAmount > 0 ? monthsFromAmount : 0
      }

      return computedAmount > 0 ? 1 : 0
    })()

    const payload = {
      client_id: client.id,
      period_key: periodKey ?? state.periods?.selected ?? state.periods?.current,
      paid_on: paidOn ?? today(),
      amount: computedAmount,
      months_paid: computedMonths > 0 ? computedMonths : null,
      method: method ?? 'Efectivo',
      note: note ?? '',
    }

    if (service?.id) {
      payload.client_service_id = service.id
    }

    await runMutation({
      set,
      resources: 'payments',
      action: async () => {
        await apiClient.post('/payments', payload)
      },
    })

    invalidateQuery(queryKeys.clients())
    invalidateQuery(queryKeys.payments(periodKey ?? state.periods?.selected ?? state.periods?.current))
    invalidateQuery(['metrics'])

    await Promise.all([
      get().loadClients({ force: true, retries: 1 }),
      get().loadPayments({ force: true, retries: 1, periodKey }),
      get().loadMetrics({ force: true, retries: 1, periodKey }),
    ])
  },
  addExpense: async (expense) => {
    await runMutation({
      set,
      resources: 'expenses',
      action: async () => {
        await apiClient.post('/expenses', {
          base_id: expense.base,
          expense_date: expense.date || today(),
          category: expense.cat,
          description: expense.desc,
          amount: expense.amount,
        })
      },
    })

    invalidateQuery(queryKeys.expenses())
    invalidateQuery(['metrics'])

    await Promise.all([
      get().loadExpenses({ force: true, retries: 1 }),
      get().loadMetrics({ force: true, retries: 1 }),
    ])
  },
  addResellerDelivery: async ({ resellerId, qty, date, totalValue = 0 }) => {
    const items = Object.entries(qty ?? {})
      .filter(([, value]) => Number(value) > 0)
      .map(([voucherTypeId, quantity]) => ({
        voucher_type_id: VOUCHER_TYPE_IDS[voucherTypeId] ?? Number(voucherTypeId),
        quantity: Number(quantity),
      }))

    await runMutation({
      set,
      resources: 'resellers',
      action: async () => {
        await apiClient.post(`/resellers/${resellerId}/deliveries`, {
          reseller_id: resellerId,
          delivered_on: date ?? today(),
          settlement_status: 'pending',
          total_value: totalValue,
          items,
        })
      },
    })

    invalidateQuery(queryKeys.resellers())
    await get().loadResellers({ force: true, retries: 1 })
  },
  settleResellerDelivery: async ({ resellerId, deliveryId, amount, notes = '' }) => {
    await runMutation({
      set,
      resources: ['resellers', 'metrics'],
      action: async () => {
        await apiClient.post(`/resellers/${resellerId}/settlements`, {
          reseller_id: resellerId,
          delivery_id: deliveryId,
          settled_on: today(),
          amount: amount ?? 0,
          notes,
        })
      },
    })

    invalidateQuery(queryKeys.resellers())
    invalidateQuery(['metrics'])

    await Promise.all([
      get().loadResellers({ force: true, retries: 1 }),
      get().loadMetrics({ force: true, retries: 1 }),
    ])
  },
  addInventoryItem: async (payload) => {
    await runMutation({
      set,
      resources: 'inventory',
      action: async () => {
        await apiClient.post('/inventory', {
          brand: payload.brand.trim(),
          model: normalizeTextOrNull(payload.model),
          serial_number: normalizeTextOrNull(payload.serial),
          asset_tag: normalizeTextOrNull(payload.assetTag),
          base_id: payload.base,
          ip_address: normalizeTextOrNull(payload.ip),
          status: payload.status,
          location: payload.location.trim(),
          client_id: payload.client ?? null,
          notes: normalizeTextOrNull(payload.notes),
          installed_at: payload.installedAt || null,
        })
      },
    })

    invalidateQuery(queryKeys.inventory())
    await get().loadInventory({ force: true, retries: 1 })
  },
  updateInventoryItem: async ({ id, ...changes }) => {
    await runMutation({
      set,
      resources: 'inventory',
      action: async () => {
        await apiClient.put(`/inventory/${id}`, {
          brand: changes.brand.trim(),
          model: normalizeTextOrNull(changes.model),
          serial_number: normalizeTextOrNull(changes.serial),
          asset_tag: normalizeTextOrNull(changes.assetTag),
          base_id: changes.base,
          ip_address: normalizeTextOrNull(changes.ip),
          status: changes.status,
          location: changes.location.trim(),
          client_id: changes.client ?? null,
          notes: normalizeTextOrNull(changes.notes),
          installed_at: changes.installedAt || null,
        })
      },
    })

    invalidateQuery(queryKeys.inventory())
    await get().loadInventory({ force: true, retries: 1 })
  },
  removeInventoryItem: async (itemId) => {
    await runMutation({
      set,
      resources: 'inventory',
      action: async () => {
        await apiClient.delete(`/inventory/${itemId}`)
      },
    })

    invalidateQuery(queryKeys.inventory())
    await get().loadInventory({ force: true, retries: 1 })
  },
  updateBaseCosts: async (partial) => {
    const state = get()
    const merged = { ...state.baseCosts, ...partial }
    const periodKey = state.periods?.selected ?? state.periods?.current ?? null

    const payloadCosts = Object.entries(merged).reduce((acc, [key, value]) => {
      const match = /^base(\d+)$/.exec(key)
      if (!match) {
        return acc
      }
      const numeric = normalizeDecimal(value, 0)
      const rounded = Math.round(numeric * 100) / 100
      acc[match[1]] = rounded
      return acc
    }, {})

    const response = await runMutation({
      set,
      resources: 'metrics',
      action: async () => {
        const { data } = await apiClient.put('/metrics/base-costs', {
          period_key: periodKey,
          costs: payloadCosts,
        })
        return data
      },
    })

    const normalizedBaseCosts = convertBaseCosts(response?.costs ?? {})
    set({ baseCosts: normalizedBaseCosts })

    invalidateQuery(['metrics'])
    await get().loadMetrics({ force: true, retries: 1, periodKey })
  },
  updateVoucherPrices: (partial) =>
    set((state) => ({ voucherPrices: { ...state.voucherPrices, ...partial } })),
}))
