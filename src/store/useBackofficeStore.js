import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  today,
  getCurrentPeriodKey,
  addMonthsToPeriod,
  diffPeriods,
} from '../utils/formatters.js'

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

export const CLIENT_PRICE = 300

export const INVENTORY_IP_RANGES = {
  1: { label: 'Base 1', prefix: '192.168.4.', start: 1, end: 254 },
  2: { label: 'Base 2', prefix: '192.168.91.', start: 1, end: 254 },
}

const fallbackStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

const createId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

const INVENTORY_STATUSES = ['assigned', 'available', 'maintenance']

const normalizeInventoryStatus = (status, client) => {
  const normalized = typeof status === 'string' ? status.toLowerCase().trim() : ''
  if (INVENTORY_STATUSES.includes(normalized)) {
    return normalized
  }
  return client ? 'assigned' : 'available'
}

const createInventoryItem = (item) => {
  const base = Number.isFinite(Number(item.base)) ? Number(item.base) : 1
  const ip = item.ip?.trim() ?? ''

  return {
    id: createId('EQP'),
    brand: item.brand?.trim() || 'Equipo',
    model: item.model?.trim() || '',
    serial: item.serial?.trim() || '',
    base,
    ip: ip || null,
    client: item.client?.trim() || null,
    location: item.location?.trim() || 'Almacén',
    status: normalizeInventoryStatus(item.status, item.client),
    notes: item.notes?.trim() || '',
    installedAt: item.installedAt ?? null,
  }
}

const sanitizeInventoryUpdate = (current, changes) => {
  const nextClient =
    changes.client !== undefined ? changes.client?.trim() || null : current.client
  const nextBase =
    changes.base !== undefined && Number.isFinite(Number(changes.base))
      ? Number(changes.base)
      : current.base
  const nextIp = changes.ip !== undefined ? changes.ip?.trim() || null : current.ip
  const nextLocation =
    changes.location !== undefined
      ? changes.location?.trim() || 'Almacén'
      : current.location
  const nextNotes = changes.notes !== undefined ? changes.notes?.trim() || '' : current.notes
  const nextStatus =
    changes.status !== undefined
      ? normalizeInventoryStatus(changes.status, nextClient)
      : normalizeInventoryStatus(current.status, nextClient)
  const nextBrand =
    changes.brand !== undefined ? changes.brand?.trim() || 'Equipo' : current.brand
  const nextModel = changes.model !== undefined ? changes.model?.trim() || '' : current.model
  const nextSerial =
    changes.serial !== undefined ? changes.serial?.trim() || '' : current.serial
  const nextInstalledAt =
    changes.installedAt !== undefined ? changes.installedAt : current.installedAt

  return {
    ...current,
    brand: nextBrand,
    model: nextModel,
    serial: nextSerial,
    base: nextBase,
    ip: nextIp,
    client: nextClient,
    location: nextLocation,
    status: nextStatus,
    notes: nextNotes,
    installedAt: nextInstalledAt,
  }
}

const createInitialState = () => ({
  clients: [
    {
      id: createId('CLI'),
      type: 'residential',
      name: 'Juan Pérez',
      location: 'Nuevo Amatenango',
      base: 1,
      ip: '192.168.3.15',
      monthlyFee: 300,
      paidMonthsAhead: 0,
      debtMonths: 0,
      service: 'Activo',
    },
    {
      id: createId('CLI'),
      type: 'residential',
      name: 'Ana Gómez',
      location: 'Belén',
      base: 1,
      ip: '192.168.3.33',
      monthlyFee: 300,
      paidMonthsAhead: 0,
      debtMonths: 0,
      service: 'Activo',
    },
    {
      id: createId('CLI'),
      type: 'residential',
      name: 'María Gómez',
      location: 'Lagunita',
      base: 2,
      ip: '192.168.200.7',
      monthlyFee: 250,
      paidMonthsAhead: 0,
      debtMonths: 1,
      service: 'Activo',
    },
    {
      id: createId('CLI'),
      type: 'residential',
      name: 'Pedro López',
      location: 'Zapotal',
      base: 2,
      ip: '192.168.200.29',
      monthlyFee: 200,
      paidMonthsAhead: 0,
      debtMonths: 2,
      service: 'Suspendido',
    },
    {
      id: createId('CLI'),
      type: 'residential',
      name: 'José Ruiz',
      location: 'Naranjal',
      base: 1,
      ip: '192.168.3.44',
      monthlyFee: 300,
      paidMonthsAhead: 0,
      debtMonths: 1,
      service: 'Activo',
    },
    {
      id: createId('CLI'),
      type: 'token',
      name: 'Punto Comunitario 1',
      location: 'Nuevo Amatenango',
      base: 1,
      antennaModel: 'LiteBeam',
      antennaIp: '192.168.4.10',
      modemModel: 'Router TP-Link',
      modemIp: '192.168.5.10',
      monthlyFee: 0,
      paidMonthsAhead: 0,
      debtMonths: 0,
      service: 'Activo',
    },
    {
      id: createId('CLI'),
      type: 'token',
      name: 'Punto Comunitario 2',
      location: 'Lagunita',
      base: 2,
      antennaModel: 'Loco M5',
      antennaIp: '192.168.90.15',
      modemModel: 'Router Mikrotik',
      modemIp: '192.168.91.15',
      monthlyFee: 0,
      paidMonthsAhead: 0,
      debtMonths: 0,
      service: 'Activo',
    },
  ],
  payments: [],
  resellers: [
    {
      id: createId('RES'),
      name: 'Juan Rev',
      base: 2,
      location: 'Lagunita',
      deliveries: [
        {
          id: 'E-001',
          date: '2025-11-02',
          qty: { h1: 20, h3: 10, d1: 15, w1: 8, d15: 4, m1: 2 },
          settled: false,
        },
      ],
      settlements: [],
    },
    {
      id: createId('RES'),
      name: 'María Rev',
      base: 1,
      location: 'Belén',
      deliveries: [
        {
          id: 'E-002',
          date: '2025-11-10',
          qty: { h1: 50, h3: 20, d1: 20, w1: 6, d15: 3, m1: 1 },
          settled: false,
        },
      ],
      settlements: [],
    },
  ],
  expenses: [
    { id: createId('EXP'), date: '2025-11-05', desc: 'Gasolina cobros', cat: 'Gasolina', amount: 350, base: 1 },
    { id: createId('EXP'), date: '2025-11-08', desc: 'Conectores RJ45', cat: 'Materiales', amount: 220, base: 2 },
  ],
  baseCosts: { base1: 2900, base2: 3750 },
  voucherPrices: { h1: 5, h3: 8, d1: 15, w1: 45, d15: 70, m1: 140 },
  periods: createInitialPeriods(),
  inventory: [
    createInventoryItem({
      brand: 'Ubiquiti',
      model: 'LiteBeam M5',
      ip: '192.168.91.10',
      base: 2,
      client: 'Lexis',
      location: 'Naranjal',
      notes: 'Antena pública en servicio.',
    }),
    createInventoryItem({
      brand: 'Ubiquiti',
      model: 'LiteBeam M5',
      ip: '192.168.91.11',
      base: 2,
      client: 'Alexis',
      location: 'Naranjal',
      notes: 'Con enlace dedicado en Base 2.',
    }),
    createInventoryItem({
      brand: 'Ubiquiti',
      model: 'LiteBeam M5',
      ip: '192.168.4.12',
      base: 1,
      client: 'Punto comunitario escuela',
      location: 'Nuevo Amatenango',
      notes: 'Cobertura principal para la escuela.',
    }),
    createInventoryItem({
      brand: 'TP-Link',
      model: 'CPE610',
      base: 1,
      status: 'maintenance',
      location: 'Taller',
      notes: 'En revisión y ajuste de alineación.',
    }),
    createInventoryItem({
      brand: 'MikroTik',
      model: 'LHG 5',
      base: 2,
      status: 'available',
      location: 'Almacén',
      notes: 'Disponible para próxima instalación.',
    }),
  ],
})

const computeDeliveryValue = (qty, prices) =>
  Object.entries(qty).reduce((total, [key, value]) => {
    const price = prices?.[key] ?? 0
    return total + (value ?? 0) * price
  }, 0)

export const useBackofficeStore = create(
  persist(
    (set, get) => ({
      ...createInitialState(),
      syncCurrentPeriod: () =>
        set((state) => {
          const actualCurrent = getCurrentPeriodKey()
          const existingPeriods = state.periods ?? createInitialPeriods()
          const lastUpdate = existingPeriods.lastUpdate ?? existingPeriods.current ?? actualCurrent
          const monthsSinceUpdate = diffPeriods(lastUpdate, actualCurrent)

          const desiredHistoryStart = addMonthsToPeriod(actualCurrent, -(PERIOD_HISTORY_MONTHS - 1))
          const previousHistoryStart = existingPeriods.historyStart ?? desiredHistoryStart
          const normalizedHistoryStart =
            diffPeriods(desiredHistoryStart, previousHistoryStart) > 0
              ? desiredHistoryStart
              : previousHistoryStart

          if (monthsSinceUpdate <= 0) {
            const selected = existingPeriods.selected ?? actualCurrent
            const shouldClampSelected = diffPeriods(actualCurrent, selected) > 0

            return {
              periods: {
                ...existingPeriods,
                current: actualCurrent,
                lastUpdate,
                historyStart: normalizedHistoryStart,
                selected: shouldClampSelected ? actualCurrent : selected,
              },
            }
          }

          const updatedClients = state.clients.map((client) => {
            const currentDebt = Number(client.debtMonths ?? 0)
            const currentAhead = Number(client.paidMonthsAhead ?? 0)

            const safeDebt = Number.isFinite(currentDebt) ? Math.max(currentDebt, 0) : 0
            const safeAhead = Number.isFinite(currentAhead) ? Math.max(currentAhead, 0) : 0

            const consumedAhead = Math.min(safeAhead, monthsSinceUpdate)
            const remainingAhead = safeAhead - consumedAhead
            const additionalDebt = monthsSinceUpdate - consumedAhead
            const projectedDebt = safeDebt + additionalDebt

            const normalizedDebt = projectedDebt < 0.0001 ? 0 : Number(projectedDebt.toFixed(4))
            const normalizedAhead = remainingAhead < 0.0001 ? 0 : Number(remainingAhead.toFixed(4))

            return {
              ...client,
              debtMonths: normalizedDebt,
              paidMonthsAhead: normalizedAhead,
              service: normalizedDebt === 0 ? 'Activo' : 'Suspendido',
            }
          })

          return {
            clients: updatedClients,
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
      addClient: (payload) =>
        set((state) => ({
          clients: [
            ...state.clients,
            {
              id: createId('CLI'),
              ...payload,
              type: payload.type ?? 'residential',
              monthlyFee:
                Number(payload.monthlyFee) || (payload.type === 'token' ? 0 : CLIENT_PRICE),
              service: payload.debtMonths > 0 ? 'Suspendido' : 'Activo',
            },
          ],
        })),
      toggleClientService: (clientId) =>
        set((state) => ({
          clients: state.clients.map((client) =>
            client.id === clientId
              ? {
                  ...client,
                  service: client.service === 'Activo' ? 'Suspendido' : 'Activo',
                }
              : client,
          ),
        })),
      recordPayment: ({ clientId, months, amount, method, note }) =>
        set((state) => {
          const client = state.clients.find((item) => item.id === clientId)
          if (!client) {
            return state
          }

          const clientMonthlyFee = client?.monthlyFee ?? CLIENT_PRICE
          const normalizedMonthlyFee = clientMonthlyFee > 0 ? clientMonthlyFee : CLIENT_PRICE

          const safeMonths = Number.isFinite(Number(months)) ? Math.max(0, Number(months)) : 0
          const providedAmount = Number.isFinite(Number(amount)) ? Math.max(0, Number(amount)) : 0
          const computedAmount =
            providedAmount > 0 ? providedAmount : safeMonths * normalizedMonthlyFee
          const effectiveMonths =
            normalizedMonthlyFee > 0 ? computedAmount / normalizedMonthlyFee : safeMonths

          if (!Number.isFinite(effectiveMonths) || effectiveMonths <= 0) {
            return state
          }

          const updatedClients = state.clients.map((candidate) => {
            if (candidate.id !== clientId) return candidate

            const currentDebt = Number(candidate.debtMonths ?? 0)
            const currentAhead = Number(candidate.paidMonthsAhead ?? 0)

            const remainingAfterDebt = Math.max(0, effectiveMonths - Math.max(0, currentDebt))

            const newDebt = Math.max(0, currentDebt - effectiveMonths)
            const normalizedDebt = newDebt < 0.0001 ? 0 : Number(newDebt.toFixed(4))
            const newAhead =
              remainingAfterDebt > 0 ? currentAhead + remainingAfterDebt : currentAhead
            const normalizedAhead = newAhead < 0.0001 ? 0 : Number(newAhead.toFixed(4))

            return {
              ...candidate,
              debtMonths: normalizedDebt,
              paidMonthsAhead: normalizedAhead,
              service: normalizedDebt === 0 ? 'Activo' : candidate.service,
            }
          })

          const paymentEntry = {
            id: createId('PAY'),
            date: today(),
            clientId,
            clientName: client?.name ?? 'Cliente desconocido',
            months: Number(effectiveMonths.toFixed(4)),
            method: method || 'Efectivo',
            note: note?.trim() ?? '',
            amount: Number(computedAmount.toFixed(2)),
          }

          return {
            clients: updatedClients,
            payments: [paymentEntry, ...state.payments],
          }
        }),
      addExpense: (expense) =>
        set((state) => ({
          expenses: [
            {
              id: createId('EXP'),
              date: expense.date || today(),
              desc: expense.desc,
              cat: expense.cat,
              amount: Number(expense.amount) || 0,
              base: Number(expense.base) || 0,
            },
            ...state.expenses,
          ],
        })),
      addResellerDelivery: ({ resellerId, qty, date }) =>
        set((state) => ({
          resellers: state.resellers.map((reseller) =>
            reseller.id !== resellerId
              ? reseller
              : {
                  ...reseller,
                  deliveries: [
                    ...reseller.deliveries,
                    {
                      id: createId('DEL'),
                      date: date || today(),
                      qty: { ...qty },
                      settled: false,
                    },
                  ],
                },
          ),
        })),
      settleResellerDelivery: ({ resellerId, deliveryId, paidPercent, received, leftovers = {} }) =>
        set((state) => {
          const prices = state.voucherPrices
          let settlementData = null

          const updatedResellers = state.resellers.map((reseller) => {
            if (reseller.id !== resellerId) return reseller

            const deliveries = reseller.deliveries.map((delivery) => {
              if (delivery.id !== deliveryId) return delivery

              const sanitizedLeftovers = {}
              const soldQty = {}
              const breakdown = {}

              let expected = 0
              let totalSold = 0

              Object.entries(delivery.qty ?? {}).forEach(([key, deliveredQty]) => {
                const price = prices?.[key] ?? 0
                const rawLeftover = Number(leftovers?.[key]) || 0
                const deliveredAmount = Number(deliveredQty) || 0
                const safeLeftover = Math.min(Math.max(rawLeftover, 0), deliveredAmount)
                const sold = deliveredAmount - safeLeftover

                sanitizedLeftovers[key] = safeLeftover
                soldQty[key] = sold
                breakdown[key] = {
                  delivered: deliveredAmount,
                  leftover: safeLeftover,
                  sold,
                  expected: sold * price,
                }

                expected += sold * price
                totalSold += sold
              })

              const resellerGain = Math.round((expected * (paidPercent ?? 0)) / 100)
              const myGain = expected - resellerGain
              const receivedAmount = Number(received) || 0
              settlementData = {
                id: createId('SET'),
                date: today(),
                total: expected,
                resellerGain,
                myGain,
                expected,
                diff: receivedAmount - expected,
                received: receivedAmount,
                paidPercent,
                deliveredQty: { ...delivery.qty },
                leftoverQty: sanitizedLeftovers,
                soldQty,
                breakdown,
                totalSold,
              }
              return { ...delivery, settled: true }
            })

            const settlements = settlementData
              ? [...reseller.settlements, settlementData]
              : reseller.settlements

            return { ...reseller, deliveries, settlements }
          })

          if (!settlementData) return {}

          return {
            resellers: updatedResellers,
          }
        }),
      updateBaseCosts: (partial) =>
        set((state) => ({
          baseCosts: { ...state.baseCosts, ...partial },
        })),
      updateVoucherPrices: (partial) =>
        set((state) => ({
          voucherPrices: { ...state.voucherPrices, ...partial },
        })),
      addInventoryItem: (payload) =>
        set((state) => ({
          inventory: [...state.inventory, createInventoryItem(payload)],
        })),
      updateInventoryItem: ({ id, ...changes }) =>
        set((state) => ({
          inventory: state.inventory.map((item) =>
            item.id === id ? sanitizeInventoryUpdate(item, changes) : item,
          ),
        })),
      removeInventoryItem: (itemId) =>
        set((state) => ({
          inventory: state.inventory.filter((item) => item.id !== itemId),
        })),
      resetDemoData: () => set(() => createInitialState()),
    }),
    {
      name: 'backoffice-storage',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : fallbackStorage,
      ),
      version: 3,
      migrate: (persistedState, version) => {
        if (!persistedState) return persistedState

        let nextState = { ...persistedState }

        if (version < 2) {
          nextState = {
            ...nextState,
            periods: createInitialPeriods(),
          }
        }

        if (version < 3 || !nextState.inventory) {
          nextState = {
            ...nextState,
            inventory: createInitialState().inventory,
          }
        }

        return nextState
      },
      partialize: (state) => ({
        clients: state.clients,
        payments: state.payments,
        resellers: state.resellers,
        expenses: state.expenses,
        baseCosts: state.baseCosts,
        voucherPrices: state.voucherPrices,
        periods: state.periods,
        inventory: state.inventory,
      }),
    },
  ),
)
