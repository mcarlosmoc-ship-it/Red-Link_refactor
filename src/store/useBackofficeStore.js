import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { today } from '../utils/formatters.js'

export const CLIENT_PRICE = 300

const fallbackStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

const createId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

const createInitialState = () => ({
  clients: [
    {
      id: createId('CLI'),
      name: 'Juan Pérez',
      location: 'Nuevo Amatenango',
      base: 1,
      ip: '192.168.3.15',
      paidMonthsAhead: 0,
      debtMonths: 0,
      service: 'Activo',
    },
    {
      id: createId('CLI'),
      name: 'Ana Gómez',
      location: 'Belén',
      base: 1,
      ip: '192.168.3.33',
      paidMonthsAhead: 0,
      debtMonths: 0,
      service: 'Activo',
    },
    {
      id: createId('CLI'),
      name: 'María Gómez',
      location: 'Lagunita',
      base: 2,
      ip: '192.168.200.7',
      paidMonthsAhead: 0,
      debtMonths: 1,
      service: 'Activo',
    },
    {
      id: createId('CLI'),
      name: 'Pedro López',
      location: 'Zapotal',
      base: 2,
      ip: '192.168.200.29',
      paidMonthsAhead: 0,
      debtMonths: 2,
      service: 'Suspendido',
    },
    {
      id: createId('CLI'),
      name: 'José Ruiz',
      location: 'Naranjal',
      base: 1,
      ip: '192.168.3.44',
      paidMonthsAhead: 0,
      debtMonths: 1,
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
      addClient: (payload) =>
        set((state) => ({
          clients: [
            ...state.clients,
            {
              id: createId('CLI'),
              ...payload,
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
      recordPayment: ({ clientId, months, method, note }) =>
        set((state) => {
          const amountMonths = Math.max(0, Number(months) || 0)
          const updatedClients = state.clients.map((client) => {
            if (client.id !== clientId) return client

            let remainingMonths = amountMonths
            let debt = client.debtMonths
            let ahead = client.paidMonthsAhead

            if (remainingMonths >= debt) {
              remainingMonths -= debt
              debt = 0
              ahead = ahead + remainingMonths
            } else {
              debt = Math.max(0, debt - remainingMonths)
            }

            return {
              ...client,
              debtMonths: debt,
              paidMonthsAhead: ahead,
              service: debt === 0 ? 'Activo' : client.service,
            }
          })

          const client = state.clients.find((item) => item.id === clientId)

          const paymentEntry = {
            id: createId('PAY'),
            date: today(),
            clientId,
            clientName: client?.name ?? 'Cliente desconocido',
            months: amountMonths,
            method: method || 'Efectivo',
            note: note?.trim() ?? '',
            amount: amountMonths * CLIENT_PRICE,
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
      settleResellerDelivery: ({ resellerId, deliveryId, paidPercent, received }) =>
        set((state) => {
          const prices = state.voucherPrices
          let settlementData = null

          const updatedResellers = state.resellers.map((reseller) => {
            if (reseller.id !== resellerId) return reseller

            const deliveries = reseller.deliveries.map((delivery) => {
              if (delivery.id !== deliveryId) return delivery

              const total = computeDeliveryValue(delivery.qty, prices)
              const resellerGain = Math.round((total * (paidPercent ?? 0)) / 100)
              const myGain = total - resellerGain
              settlementData = {
                id: createId('SET'),
                date: today(),
                total,
                resellerGain,
                myGain,
                expected: total,
                diff: (Number(received) || 0) - total,
                received: Number(received) || 0,
                paidPercent,
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
      resetDemoData: () => set(() => createInitialState()),
    }),
    {
      name: 'backoffice-storage',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : fallbackStorage,
      ),
      version: 1,
      partialize: (state) => ({
        clients: state.clients,
        payments: state.payments,
        resellers: state.resellers,
        expenses: state.expenses,
        baseCosts: state.baseCosts,
        voucherPrices: state.voucherPrices,
      }),
    },
  ),
)
