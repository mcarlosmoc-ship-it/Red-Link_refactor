import { useMemo } from 'react'
import { CLIENT_PRICE, useBackofficeStore } from '../store/useBackofficeStore.js'
import {
  PAYMENT_STATUS,
  getClientCoverageContext,
  getClientDebtSummary,
  getClientMonthlyFee,
  getClientPaymentStatus,
} from '../features/clients/utils.js'

const normalizeMetricValue = (value, fallback = 0) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export const useDashboardMetrics = ({ statusFilter: overrideStatusFilter } = {}) => {
  const { metricsSummary, dashboardClients, baseCosts, metricsFilters, clients } =
    useBackofficeStore((state) => ({
      metricsSummary: state.metrics,
      dashboardClients: state.dashboardClients ?? [],
      baseCosts: state.baseCosts ?? {},
      metricsFilters: state.metricsFilters ?? { statusFilter: 'all', searchTerm: '' },
      clients: state.clients ?? [],
    }))

  const normalizedClients = useMemo(() => {
    return dashboardClients.map((client) => {
      const fullClient = clients.find((item) => String(item.id) === String(client.id)) ?? null
      const clientShape = fullClient ?? {
        id: client.id,
        services: [],
        monthlyFee: normalizeMetricValue(client.monthly_fee, CLIENT_PRICE),
        paidMonthsAhead: normalizeMetricValue(client.paid_months_ahead),
        debtMonths: normalizeMetricValue(client.debt_months),
        service: client.service_status ?? 'Activo',
        type: client.client_type ?? null,
        name: client.name,
        location: client.location,
      }

      const monthlyFee = getClientMonthlyFee(clientShape, CLIENT_PRICE)
      const coverage = getClientCoverageContext(clientShape)
      const debtSummary = getClientDebtSummary(clientShape, monthlyFee)
      const paymentStatus = getClientPaymentStatus(clientShape, monthlyFee)

      return {
        id: clientShape.id,
        name: clientShape.name ?? client.name,
        location: clientShape.location ?? client.location,
        monthlyFee,
        debtMonths: debtSummary.debtMonths ?? 0,
        paidMonthsAhead: coverage.aheadMonths ?? 0,
        service: clientShape.service ?? client.service_status ?? 'Activo',
        type: clientShape.type ?? client.client_type ?? null,
        paymentStatus,
      }
    })
  }, [clients, dashboardClients])

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

    const clientPaymentStatuses = normalizedClients.map(
      (client) => client.paymentStatus ?? getClientPaymentStatus(client, client.monthlyFee ?? CLIENT_PRICE),
    )
    const paidClients = clientPaymentStatuses.filter((status) => status === PAYMENT_STATUS.PAID)
      .length
    const pendingClients = clientPaymentStatuses.filter(
      (status) => status === PAYMENT_STATUS.PENDING,
    ).length

    return {
      totalClients: normalizeMetricValue(metricsSummary.total_clients),
      paidClients,
      pendingClients,
      clientIncome: normalizeMetricValue(metricsSummary.client_income),
      totalDebtAmount: normalizeMetricValue(metricsSummary.total_debt_amount),
      resellerIncome: normalizeMetricValue(metricsSummary.reseller_income),
      totalExpenses: normalizeMetricValue(metricsSummary.total_expenses),
      internetCosts,
      netEarnings: normalizeMetricValue(metricsSummary.net_earnings),
      paymentsForPeriod: normalizeMetricValue(metricsSummary.payments_for_period),
      paymentsToday: normalizeMetricValue(metricsSummary.payments_today),
    }
  }, [metricsSummary, baseCosts, normalizedClients])

  const activeStatusFilter = overrideStatusFilter ?? metricsFilters?.statusFilter ?? 'all'

  const filteredClients = useMemo(() => {
    return normalizedClients.filter((client) => {
      const status = client.paymentStatus ?? getClientPaymentStatus(client, client.monthlyFee ?? CLIENT_PRICE)
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
