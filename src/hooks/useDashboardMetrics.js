import { useMemo } from 'react'
import { CLIENT_PRICE, useBackofficeStore } from '../store/useBackofficeStore.js'
import { PAYMENT_STATUS, getClientPaymentStatus } from '../features/clients/utils.js'

const normalizeMetricValue = (value, fallback = 0) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export const useDashboardMetrics = ({ statusFilter: overrideStatusFilter } = {}) => {
  const { metricsSummary, dashboardClients, baseCosts, metricsFilters } = useBackofficeStore((state) => ({
    metricsSummary: state.metrics,
    dashboardClients: state.dashboardClients ?? [],
    baseCosts: state.baseCosts ?? {},
    metricsFilters: state.metricsFilters ?? { statusFilter: 'all', searchTerm: '' },
  }))

  const metrics = useMemo(() => {
    if (!metricsSummary) {
      const fallbackInternetCosts = Object.values(baseCosts ?? {}).reduce(
        (total, cost) => total + normalizeMetricValue(cost, 0),
        0,
      )

      return {
        totalClients: 0,
        paidClients: 0,
        pendingClients: 0,
        clientIncome: 0,
        totalDebtAmount: 0,
        resellerIncome: 0,
        totalExpenses: 0,
        internetCosts: fallbackInternetCosts,
        netEarnings: 0,
        paymentsForPeriod: 0,
        paymentsToday: 0,
      }
    }

    const internetCosts = normalizeMetricValue(metricsSummary.internet_costs)

    return {
      totalClients: normalizeMetricValue(metricsSummary.total_clients),
      paidClients: normalizeMetricValue(metricsSummary.paid_clients),
      pendingClients: normalizeMetricValue(metricsSummary.pending_clients),
      clientIncome: normalizeMetricValue(metricsSummary.client_income),
      totalDebtAmount: normalizeMetricValue(metricsSummary.total_debt_amount),
      resellerIncome: normalizeMetricValue(metricsSummary.reseller_income),
      totalExpenses: normalizeMetricValue(metricsSummary.total_expenses),
      internetCosts,
      netEarnings: normalizeMetricValue(metricsSummary.net_earnings),
      paymentsForPeriod: normalizeMetricValue(metricsSummary.payments_for_period),
      paymentsToday: normalizeMetricValue(metricsSummary.payments_today),
    }
  }, [metricsSummary, baseCosts])

  const normalizedClients = useMemo(
    () =>
      dashboardClients.map((client) => ({
        id: client.id,
        name: client.name,
        location: client.location,
        monthlyFee: normalizeMetricValue(client.monthly_fee, CLIENT_PRICE),
        debtMonths: normalizeMetricValue(client.debt_months),
        paidMonthsAhead: normalizeMetricValue(client.paid_months_ahead),
        service: client.service_status ?? 'Activo',
        type: client.client_type ?? null,
      })),
    [dashboardClients],
  )

  const activeStatusFilter = overrideStatusFilter ?? metricsFilters?.statusFilter ?? 'all'

  const filteredClients = useMemo(() => {
    return normalizedClients.filter((client) => {
      const status = getClientPaymentStatus(client, client.monthlyFee ?? CLIENT_PRICE)
      if (activeStatusFilter === PAYMENT_STATUS.PENDING) {
        return status === PAYMENT_STATUS.PENDING
      }
      if (activeStatusFilter === PAYMENT_STATUS.PAID) {
        return status === PAYMENT_STATUS.PAID
      }
      if (activeStatusFilter === PAYMENT_STATUS.DUE_SOON) {
        return status === PAYMENT_STATUS.DUE_SOON
      }
      return true
    })
  }, [normalizedClients, activeStatusFilter])

  return { metrics, filteredClients, projectedClients: normalizedClients, baseCosts }
}
