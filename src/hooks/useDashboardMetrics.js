import { useMemo } from 'react'
import { CLIENT_PRICE, useBackofficeStore } from '../store/useBackofficeStore.js'

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
      return {
        totalClients: 0,
        paidClients: 0,
        pendingClients: 0,
        clientIncome: 0,
        totalDebtAmount: 0,
        resellerIncome: 0,
        totalExpenses: 0,
        internetCosts: (baseCosts?.base1 ?? 0) + (baseCosts?.base2 ?? 0),
        netEarnings: 0,
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
    if (activeStatusFilter === 'pending') {
      return normalizedClients.filter((client) => Number(client.debtMonths ?? 0) > 0.0001)
    }

    if (activeStatusFilter === 'paid') {
      return normalizedClients.filter((client) => Number(client.debtMonths ?? 0) <= 0.0001)
    }

    return normalizedClients
  }, [normalizedClients, activeStatusFilter])

  return { metrics, filteredClients, projectedClients: normalizedClients, baseCosts }
}
