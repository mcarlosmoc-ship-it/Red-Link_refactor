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
  deliveries: reseller.deliveries.map((delivery) => ({
    id: delivery.id,
    date: delivery.delivered_on,
    settled: delivery.settlement_status === 'settled',
    totalValue: normalizeDecimal(delivery.total_value),
    qty: delivery.items.reduce((acc, item) => {
      const voucherKey = voucherTypeKeyById[String(item.voucher_type_id)] ?? `type-${item.voucher_type_id}`
      acc[voucherKey] = item.quantity
      return acc
    }, {}),
  })),
  settlements: reseller.settlements.map((settlement) => ({
    id: settlement.id,
    date: settlement.settled_on,
    amount: normalizeDecimal(settlement.amount),
    note: settlement.notes ?? '',
  })),
})

const convertBaseCosts = (baseCosts = {}) =>
  Object.entries(baseCosts).reduce((acc, [baseId, value]) => {
    const key = `base${baseId}`
    acc[key] = normalizeDecimal(value)
    return acc
  }, {})

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
  loading: false,
  error: null,
})

const setAsyncState = async (setter, action) => {
  try {
    await action()
  } catch (error) {
    const message = error?.message ?? 'Ocurrió un error inesperado.'
    setter({ error: message })
    throw error
  }
}

export const useBackofficeStore = create((set, get) => ({
  ...createInitialState(),
  clearError: () => set({ error: null }),
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
  fetchClients: async () =>
    setAsyncState(set, async () => {
      const { data } = await apiClient.get('/clients')
      set({ clients: data.map(mapClient) })
    }),
  fetchPayments: async () =>
    setAsyncState(set, async () => {
      const { data } = await apiClient.get('/payments')
      set({ payments: data.map(mapPayment) })
    }),
  fetchResellers: async () =>
    setAsyncState(set, async () => {
      const { data } = await apiClient.get('/resellers')
      set({ resellers: data.map(mapReseller) })
    }),
  fetchExpenses: async () =>
    setAsyncState(set, async () => {
      const { data } = await apiClient.get('/expenses')
      set({ expenses: data.map(mapExpense) })
    }),
  fetchInventory: async () =>
    setAsyncState(set, async () => {
      const { data } = await apiClient.get('/inventory')
      set({ inventory: data.map(mapInventoryItem) })
    }),
  fetchMetrics: async (periodKey) =>
    setAsyncState(set, async () => {
      const targetPeriod =
        periodKey ?? get().periods?.selected ?? get().periods?.current ?? getCurrentPeriodKey()
      const { data } = await apiClient.get('/metrics/overview', {
        query: { period_key: targetPeriod },
      })
      set({
        metrics: data,
        baseCosts: convertBaseCosts(data.base_costs),
      })
    }),
  initialize: async () => {
    set({ loading: true })
    try {
      await Promise.all([
        get().fetchClients(),
        get().fetchPayments(),
        get().fetchResellers(),
        get().fetchExpenses(),
        get().fetchInventory(),
      ])
      await get().fetchMetrics()
    } finally {
      set({ loading: false })
    }
  },
  refreshData: async () => {
    await get().initialize()
  },
  recordPayment: async ({ clientId, months, amount, method, note, periodKey, paidOn }) =>
    setAsyncState(set, async () => {
      const state = get()
      const client = state.clients.find((item) => item.id === clientId)
      const monthlyFee = client?.monthlyFee ?? CLIENT_PRICE
      const normalizedMonths = normalizeDecimal(months, 0)
      const normalizedAmount = normalizeDecimal(amount, 0)

      const computedAmount =
        normalizedAmount > 0 ? normalizedAmount : normalizedMonths * monthlyFee
      const computedMonths =
        normalizedMonths > 0
          ? normalizedMonths
          : monthlyFee > 0
            ? computedAmount / monthlyFee
            : 0

      await apiClient.post('/payments', {
        client_id: clientId,
        period_key: periodKey ?? state.periods?.selected ?? state.periods?.current,
        paid_on: paidOn ?? today(),
        amount: computedAmount,
        months_paid: computedMonths,
        method: method ?? 'Efectivo',
        note: note ?? '',
      })

      await Promise.all([get().fetchClients(), get().fetchPayments(), get().fetchMetrics(periodKey)])
    }),
  addExpense: async (expense) =>
    setAsyncState(set, async () => {
      await apiClient.post('/expenses', {
        base_id: expense.base,
        expense_date: expense.date || today(),
        category: expense.cat,
        description: expense.desc,
        amount: expense.amount,
      })
      await Promise.all([get().fetchExpenses(), get().fetchMetrics()])
    }),
  addResellerDelivery: async ({ resellerId, qty, date, totalValue = 0 }) =>
    setAsyncState(set, async () => {
      const items = Object.entries(qty ?? {})
        .filter(([, value]) => Number(value) > 0)
        .map(([voucherTypeId, quantity]) => ({
          voucher_type_id: VOUCHER_TYPE_IDS[voucherTypeId] ?? Number(voucherTypeId),
          quantity: Number(quantity),
        }))

      await apiClient.post(`/resellers/${resellerId}/deliveries`, {
        reseller_id: resellerId,
        delivered_on: date ?? today(),
        settlement_status: 'pending',
        total_value: totalValue,
        items,
      })

      await get().fetchResellers()
    }),
  settleResellerDelivery: async ({ resellerId, deliveryId, amount, notes = '' }) =>
    setAsyncState(set, async () => {
      await apiClient.post(`/resellers/${resellerId}/settlements`, {
        reseller_id: resellerId,
        delivery_id: deliveryId,
        settled_on: today(),
        amount: amount ?? 0,
        notes,
      })

      await Promise.all([get().fetchResellers(), get().fetchMetrics()])
    }),
  addInventoryItem: async (payload) =>
    setAsyncState(set, async () => {
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
      await get().fetchInventory()
    }),
  updateInventoryItem: async ({ id, ...changes }) =>
    setAsyncState(set, async () => {
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
      await get().fetchInventory()
    }),
  removeInventoryItem: async (itemId) =>
    setAsyncState(set, async () => {
      await apiClient.delete(`/inventory/${itemId}`)
      await get().fetchInventory()
    }),
  updateBaseCosts: (partial) =>
    set((state) => ({ baseCosts: { ...state.baseCosts, ...partial } })),
  updateVoucherPrices: (partial) =>
    set((state) => ({ voucherPrices: { ...state.voucherPrices, ...partial } })),
}))
