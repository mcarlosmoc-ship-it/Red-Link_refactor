import { create } from 'zustand'
import {
  today,
  getCurrentPeriodKey,
  addMonthsToPeriod,
  diffPeriods,
} from '../utils/formatters.js'
import { apiClient } from '../services/apiClient.js'

export const CLIENT_PRICE = 300

export const INVENTORY_IP_RANGES = {
  1: { label: 'Base 1', prefix: '192.168.4.', start: 1, end: 254 },
  2: { label: 'Base 2', prefix: '192.168.91.', start: 1, end: 254 },
}

const PERIOD_HISTORY_MONTHS = 12
const RESOURCE_TTL_MS = 60_000

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const createInitialPeriods = () => {
  const current = getCurrentPeriodKey()
  return {
    current,
    selected: current,
    lastUpdate: current,
    historyStart: addMonthsToPeriod(current, -(PERIOD_HISTORY_MONTHS - 1)),
  }
}

const defaultVoucherPrices = { h1: 5, h3: 8, d1: 15, w1: 45, d15: 70, m1: 140 }
const VOUCHER_TYPE_IDS = { h1: 1, h3: 2, d1: 3, w1: 4, d15: 5, m1: 6 }
const voucherTypeKeyById = Object.fromEntries(
  Object.entries(VOUCHER_TYPE_IDS).map(([key, id]) => [String(id), key]),
)

const normalizeDecimal = (value, fallback = 0) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const mapClient = (client) => ({
  id: client.id,
  type: client.client_type,
  name: client.full_name,
  location: client.location,
  base: client.base_id,
  ip: client.ip_address,
  antennaIp: client.antenna_ip,
  modemIp: client.modem_ip,
  monthlyFee: normalizeDecimal(client.monthly_fee, CLIENT_PRICE),
  paidMonthsAhead: normalizeDecimal(client.paid_months_ahead),
  debtMonths: normalizeDecimal(client.debt_months),
  service: client.service_status,
})

const mapPayment = (payment) => ({
  id: payment.id,
  date: payment.paid_on,
  method: payment.method,
  months: normalizeDecimal(payment.months_paid),
  amount: normalizeDecimal(payment.amount),
  note: payment.note ?? '',
  periodKey: payment.period_key,
  clientName: payment.client?.full_name ?? 'Cliente',
})

const mapExpense = (expense) => ({
  id: expense.id,
  date: expense.expense_date,
  desc: expense.description,
  cat: expense.category,
  amount: normalizeDecimal(expense.amount),
  base: expense.base_id,
})

const mapInventoryItem = (item) => ({
  id: item.id,
  brand: item.brand,
  model: item.model,
  serial: item.serial_number,
  assetTag: item.asset_tag,
  base: item.base_id,
  ip: item.ip_address,
  status: item.status,
  location: item.location,
  client: item.client_id,
  notes: item.notes,
  installedAt: item.installed_at,
})

const mapReseller = (reseller) => ({
  id: reseller.id,
  name: reseller.full_name,
  base: reseller.base_id,
  location: reseller.location,
  deliveries: (reseller.deliveries ?? []).map((delivery) => ({
    id: delivery.id,
    date: delivery.delivered_on,
    settled: delivery.settlement_status === 'settled',
    totalValue: normalizeDecimal(delivery.total_value),
    qty: (delivery.items ?? []).reduce((acc, item) => {
      const voucherKey = voucherTypeKeyById[String(item.voucher_type_id)] ?? `type-${item.voucher_type_id}`
      acc[voucherKey] = item.quantity
      return acc
    }, {}),
  })),
  settlements: (reseller.settlements ?? []).map((settlement) => ({
    id: settlement.id,
    date: settlement.settled_on,
    amount: normalizeDecimal(settlement.amount),
    note: settlement.notes ?? '',
    myGain: normalizeDecimal(settlement.my_gain ?? settlement.amount),
  })),
})

const convertBaseCosts = (baseCosts = {}) =>
  Object.entries(baseCosts).reduce((acc, [baseId, value]) => {
    const key = `base${baseId}`
    acc[key] = normalizeDecimal(value)
    return acc
  }, {})

const serializeClientPayload = (payload) => ({
  client_type: payload.type,
  full_name: payload.name,
  location: payload.location,
  base_id: payload.base,
  ip_address: payload.ip || null,
  antenna_ip: payload.antennaIp || null,
  modem_ip: payload.modemIp || null,
  antenna_model: payload.antennaModel || null,
  modem_model: payload.modemModel || null,
  monthly_fee: payload.monthlyFee ?? CLIENT_PRICE,
  paid_months_ahead: payload.paidMonthsAhead ?? 0,
  debt_months: payload.debtMonths ?? 0,
  service_status: payload.service ?? 'Activo',
})

const createResourceStatus = () => ({
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetchedAt: null,
  retries: 0,
})

const createInitialStatus = () => ({
  clients: createResourceStatus(),
  payments: createResourceStatus(),
  resellers: createResourceStatus(),
  expenses: createResourceStatus(),
  inventory: createResourceStatus(),
  metrics: createResourceStatus(),
  initialize: createResourceStatus(),
})

const setStatus = (set, resource, updates) => {
  set((state) => ({
    status: {
      ...state.status,
      [resource]: {
        ...state.status[resource],
        ...updates,
      },
    },
  }))
}

const runWithStatus = async ({ set, get, resource, action, retries = 0, updateTimestamp = true }) => {
  setStatus(set, resource, { isLoading: true, error: null })

  try {
    const result = await action()
    setStatus(set, resource, {
      isLoading: false,
      error: null,
      retries: 0,
      ...(updateTimestamp ? { lastFetchedAt: Date.now() } : {}),
    })
    return result
  } catch (error) {
    const message = error?.message ?? 'Ocurrió un error inesperado.'
    const currentRetries = (get().status?.[resource]?.retries ?? 0) + 1
    setStatus(set, resource, {
      isLoading: false,
      error: message,
      retries: currentRetries,
    })

    if (retries > 0) {
      await wait(Math.min(500 * currentRetries, 2000))
      return runWithStatus({ set, get, resource, action, retries: retries - 1, updateTimestamp })
    }

    throw error
  }
}

const runMutation = async ({ set, resources, action }) => {
  const targetResources = Array.isArray(resources) ? resources : [resources]
  targetResources.forEach((resource) => setStatus(set, resource, { isMutating: true, error: null }))

  try {
    const result = await action()
    targetResources.forEach((resource) => setStatus(set, resource, { isMutating: false }))
    return result
  } catch (error) {
    const message = error?.message ?? 'Ocurrió un error inesperado.'
    targetResources.forEach((resource) => setStatus(set, resource, { isMutating: false, error: message }))
    throw error
  }
}

const shouldUseCache = ({ status, force, ttl = RESOURCE_TTL_MS, extraCondition = true }) => {
  if (force || !extraCondition) {
    return false
  }
  if (!status?.lastFetchedAt) {
    return false
  }
  return Date.now() - status.lastFetchedAt < ttl
}

const createInitialState = () => ({
  clients: [],
  payments: [],
  resellers: [],
  expenses: [],
  inventory: [],
  baseCosts: {},
  voucherPrices: defaultVoucherPrices,
  periods: createInitialPeriods(),
  metrics: null,
  metricsPeriodKey: null,
  paymentsPeriodKey: null,
  status: createInitialStatus(),
})

export const useBackofficeStore = create((set, get) => ({
  ...createInitialState(),
  clearResourceError: (resource) => {
    if (!resource || !get().status?.[resource]) {
      return
    }
    setStatus(set, resource, { error: null })
  },
  syncCurrentPeriod: () =>
    set((state) => {
      const actualCurrent = getCurrentPeriodKey()
      const existing = state.periods ?? createInitialPeriods()
      const lastUpdate = existing.lastUpdate ?? existing.current ?? actualCurrent
      const monthsSinceUpdate = diffPeriods(lastUpdate, actualCurrent)

      const desiredHistoryStart = addMonthsToPeriod(actualCurrent, -(PERIOD_HISTORY_MONTHS - 1))
      const previousHistoryStart = existing.historyStart ?? desiredHistoryStart
      const normalizedHistoryStart =
        diffPeriods(desiredHistoryStart, previousHistoryStart) > 0
          ? desiredHistoryStart
          : previousHistoryStart

      if (monthsSinceUpdate <= 0) {
        const selected = existing.selected ?? actualCurrent
        const shouldClampSelected = diffPeriods(actualCurrent, selected) > 0

        return {
          periods: {
            ...existing,
            current: actualCurrent,
            lastUpdate,
            historyStart: normalizedHistoryStart,
            selected: shouldClampSelected ? actualCurrent : selected,
          },
        }
      }

      return {
        periods: {
          current: actualCurrent,
          selected: actualCurrent,
          lastUpdate: actualCurrent,
          historyStart: normalizedHistoryStart,
        },
      }
    }),
  setSelectedPeriod: (periodKey) =>
    set((state) => {
      const periods = state.periods ?? createInitialPeriods()
      const start = periods.historyStart
      const end = periods.current

      let next = periodKey ?? periods.selected ?? end

      if (diffPeriods(start, next) < 0) {
        next = start
      }

      if (diffPeriods(next, end) < 0) {
        next = end
      }

      return {
        periods: {
          ...periods,
          selected: next,
        },
      }
    }),
  goToPreviousPeriod: () =>
    set((state) => {
      const periods = state.periods ?? createInitialPeriods()

      if (diffPeriods(periods.historyStart, periods.selected) <= 0) {
        return { periods }
      }

      const previous = addMonthsToPeriod(periods.selected, -1)
      const normalizedPrevious =
        diffPeriods(periods.historyStart, previous) > 0 ? previous : periods.historyStart

      return {
        periods: {
          ...periods,
          selected: normalizedPrevious,
        },
      }
    }),
  goToNextPeriod: () =>
    set((state) => {
      const periods = state.periods ?? createInitialPeriods()

      if (diffPeriods(periods.selected, periods.current) <= 0) {
        return { periods }
      }

      const next = addMonthsToPeriod(periods.selected, 1)
      const normalizedNext = diffPeriods(next, periods.current) < 0 ? periods.current : next

      return {
        periods: {
          ...periods,
          selected: normalizedNext,
        },
      }
    }),
  loadClients: async ({ force = false, retries = 1 } = {}) => {
    const status = get().status.clients
    if (shouldUseCache({ status, force })) {
      return get().clients
    }

    return runWithStatus({
      set,
      get,
      resource: 'clients',
      retries,
      action: async () => {
        const { data } = await apiClient.get('/clients')
        set({ clients: data.map(mapClient) })
        return data
      },
    })
  },
  loadPayments: async ({ force = false, retries = 1, periodKey } = {}) => {
    const status = get().status.payments
    const targetPeriod = periodKey ?? get().paymentsPeriodKey ?? get().periods?.selected
    const matchesPeriod = !targetPeriod || get().paymentsPeriodKey === targetPeriod

    if (shouldUseCache({ status, force, extraCondition: matchesPeriod })) {
      return get().payments
    }

    return runWithStatus({
      set,
      get,
      resource: 'payments',
      retries,
      action: async () => {
        const query = targetPeriod ? { period_key: targetPeriod } : undefined
        const { data } = await apiClient.get('/payments', query ? { query } : undefined)
        set({ payments: data.map(mapPayment), paymentsPeriodKey: targetPeriod ?? null })
        return data
      },
    })
  },
  loadResellers: async ({ force = false, retries = 1 } = {}) => {
    const status = get().status.resellers
    if (shouldUseCache({ status, force })) {
      return get().resellers
    }

    return runWithStatus({
      set,
      get,
      resource: 'resellers',
      retries,
      action: async () => {
        const { data } = await apiClient.get('/resellers')
        set({ resellers: data.map(mapReseller) })
        return data
      },
    })
  },
  loadExpenses: async ({ force = false, retries = 1 } = {}) => {
    const status = get().status.expenses
    if (shouldUseCache({ status, force })) {
      return get().expenses
    }

    return runWithStatus({
      set,
      get,
      resource: 'expenses',
      retries,
      action: async () => {
        const { data } = await apiClient.get('/expenses')
        set({ expenses: data.map(mapExpense) })
        return data
      },
    })
  },
  loadInventory: async ({ force = false, retries = 1 } = {}) => {
    const status = get().status.inventory
    if (shouldUseCache({ status, force })) {
      return get().inventory
    }

    return runWithStatus({
      set,
      get,
      resource: 'inventory',
      retries,
      action: async () => {
        const { data } = await apiClient.get('/inventory')
        set({ inventory: data.map(mapInventoryItem) })
        return data
      },
    })
  },
  loadMetrics: async ({ force = false, retries = 1, periodKey } = {}) => {
    const status = get().status.metrics
    const targetPeriod =
      periodKey ?? get().periods?.selected ?? get().periods?.current ?? getCurrentPeriodKey()
    const matchesPeriod = get().metricsPeriodKey === targetPeriod

    if (shouldUseCache({ status, force, extraCondition: matchesPeriod })) {
      return get().metrics
    }

    return runWithStatus({
      set,
      get,
      resource: 'metrics',
      retries,
      action: async () => {
        const { data } = await apiClient.get('/metrics/overview', {
          query: { period_key: targetPeriod },
        })
        set({
          metrics: data,
          baseCosts: convertBaseCosts(data.base_costs),
          metricsPeriodKey: targetPeriod,
        })
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

    await Promise.all([
      get().loadClients({ force: true, retries: 1 }),
      get().loadMetrics({ force: true, retries: 1 }),
    ])
  },
  toggleClientService: async (clientId) => {
    const client = get().clients.find((item) => item.id === clientId)
    if (!client) {
      throw new Error('No se encontró el cliente especificado.')
    }

    const nextStatus = client.service === 'Activo' ? 'Suspendido' : 'Activo'

    await runMutation({
      set,
      resources: 'clients',
      action: async () => {
        await apiClient.patch(`/clients/${clientId}`, {
          service_status: nextStatus,
        })
      },
    })

    await Promise.all([
      get().loadClients({ force: true, retries: 1 }),
      get().loadMetrics({ force: true, retries: 1 }),
    ])

    return nextStatus
  },
  recordPayment: async ({ clientId, months, amount, method, note, periodKey, paidOn }) => {
    const state = get()
    const client = state.clients.find((item) => item.id === clientId)
    const monthlyFee = client?.monthlyFee ?? CLIENT_PRICE
    const normalizedMonths = normalizeDecimal(months, 0)
    const normalizedAmount = normalizeDecimal(amount, 0)

    const computedAmount = normalizedAmount > 0 ? normalizedAmount : normalizedMonths * monthlyFee
    const computedMonths =
      normalizedMonths > 0
        ? normalizedMonths
        : monthlyFee > 0
          ? computedAmount / monthlyFee
          : 0

    await runMutation({
      set,
      resources: 'payments',
      action: async () => {
        await apiClient.post('/payments', {
          client_id: clientId,
          period_key: periodKey ?? state.periods?.selected ?? state.periods?.current,
          paid_on: paidOn ?? today(),
          amount: computedAmount,
          months_paid: computedMonths,
          method: method ?? 'Efectivo',
          note: note ?? '',
        })
      },
    })

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
          brand: payload.brand,
          model: payload.model,
          serial_number: payload.serial,
          asset_tag: payload.assetTag,
          base_id: payload.base,
          ip_address: payload.ip,
          status: payload.status,
          location: payload.location,
          client_id: payload.client,
          notes: payload.notes,
          installed_at: payload.installedAt,
        })
      },
    })

    await get().loadInventory({ force: true, retries: 1 })
  },
  updateInventoryItem: async ({ id, ...changes }) => {
    await runMutation({
      set,
      resources: 'inventory',
      action: async () => {
        await apiClient.put(`/inventory/${id}`, {
          brand: changes.brand,
          model: changes.model,
          serial_number: changes.serial,
          asset_tag: changes.assetTag,
          base_id: changes.base,
          ip_address: changes.ip,
          status: changes.status,
          location: changes.location,
          client_id: changes.client,
          notes: changes.notes,
          installed_at: changes.installedAt,
        })
      },
    })

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

    await get().loadInventory({ force: true, retries: 1 })
  },
  updateBaseCosts: (partial) => set((state) => ({ baseCosts: { ...state.baseCosts, ...partial } })),
  updateVoucherPrices: (partial) =>
    set((state) => ({ voucherPrices: { ...state.voucherPrices, ...partial } })),
}))
