import { useMemo } from 'react'
import { CLIENT_PRICE, useBackofficeStore } from '../store/useBackofficeStore.js'
import { diffPeriods, getPeriodFromDateString } from '../utils/formatters.js'

const projectClientForOffset = (client, offset) => {
  if (!offset) {
    return {
      ...client,
      debtMonths: Number(client.debtMonths ?? 0) || 0,
      paidMonthsAhead: Number(client.paidMonthsAhead ?? 0) || 0,
      service: (client.debtMonths ?? 0) > 0 ? 'Suspendido' : client.service ?? 'Activo',
    }
  }

  const baseDebt = Number(client.debtMonths ?? 0)
  const baseAhead = Number(client.paidMonthsAhead ?? 0)

  const safeDebt = Number.isFinite(baseDebt) ? Math.max(baseDebt, 0) : 0
  const safeAhead = Number.isFinite(baseAhead) ? Math.max(baseAhead, 0) : 0

  if (offset > 0) {
    const consumedAhead = Math.min(safeAhead, offset)
    const remainingAhead = safeAhead - consumedAhead
    const extraDebt = offset - consumedAhead
    const projectedDebt = safeDebt + extraDebt

    const normalizedDebt = projectedDebt < 0.0001 ? 0 : Number(projectedDebt.toFixed(4))
    const normalizedAhead = remainingAhead < 0.0001 ? 0 : Number(remainingAhead.toFixed(4))

    return {
      ...client,
      debtMonths: normalizedDebt,
      paidMonthsAhead: normalizedAhead,
      service: normalizedDebt === 0 ? 'Activo' : 'Suspendido',
    }
  }

  const monthsBack = Math.abs(offset)
  const restoredDebt = Math.min(safeDebt, monthsBack)
  const updatedDebt = safeDebt - restoredDebt
  const recoveredAhead = monthsBack - restoredDebt
  const updatedAhead = safeAhead + recoveredAhead

  const normalizedDebt = updatedDebt < 0.0001 ? 0 : Number(updatedDebt.toFixed(4))
  const normalizedAhead = updatedAhead < 0.0001 ? 0 : Number(updatedAhead.toFixed(4))

  return {
    ...client,
    debtMonths: normalizedDebt,
    paidMonthsAhead: normalizedAhead,
    service: normalizedDebt === 0 ? 'Activo' : 'Suspendido',
  }
}

const includesSearch = (value, searchTerm) => {
  if (!searchTerm) return true
  return value?.toLowerCase().includes(searchTerm.toLowerCase())
}

export const useDashboardMetrics = ({ statusFilter, searchTerm }) => {
  const { clients, resellers, expenses, baseCosts, periods } = useBackofficeStore((state) => ({
    clients: state.clients,
    resellers: state.resellers,
    expenses: state.expenses,
    baseCosts: state.baseCosts,
    periods: state.periods,
  }))

  const selectedPeriod = periods?.selected ?? periods?.current
  const currentPeriod = periods?.current ?? selectedPeriod
  const offset = diffPeriods(currentPeriod, selectedPeriod)

  const projectedClients = useMemo(
    () => clients.map((client) => projectClientForOffset(client, offset)),
    [clients, offset],
  )

  const filteredClients = useMemo(() => {
    return projectedClients.filter((client) => {
      const matchesStatus =
        statusFilter === 'paid'
          ? client.debtMonths === 0
          : statusFilter === 'pending'
            ? client.debtMonths > 0
            : true
      const matchesSearch =
        includesSearch(client.name, searchTerm) || includesSearch(client.location, searchTerm)
      return matchesStatus && matchesSearch
    })
  }, [projectedClients, statusFilter, searchTerm])

  const metrics = useMemo(() => {
    const totalClients = projectedClients.length
    const paidClients = projectedClients.filter((client) => client.debtMonths === 0).length
    const pendingClients = projectedClients.filter((client) => client.debtMonths > 0).length
    const clientIncome = projectedClients.reduce(
      (total, client) =>
        client.debtMonths === 0 ? total + (client.monthlyFee ?? CLIENT_PRICE) : total,
      0,
    )

    const resellerIncome = resellers.reduce((acc, reseller) => {
      const settlementsGain = reseller.settlements.reduce(
        (total, settlement) =>
          getPeriodFromDateString(settlement.date) === selectedPeriod
            ? total + (settlement.myGain ?? 0)
            : total,
        0,
      )
      return acc + settlementsGain
    }, 0)

    const totalExpenses = expenses.reduce(
      (total, expense) =>
        getPeriodFromDateString(expense.date) === selectedPeriod ? total + (expense.amount ?? 0) : total,
      0,
    )
    const internetCosts = (baseCosts?.base1 ?? 0) + (baseCosts?.base2 ?? 0)
    const netEarnings = clientIncome + resellerIncome - totalExpenses - internetCosts

    return {
      totalClients,
      paidClients,
      pendingClients,
      clientIncome,
      resellerIncome,
      totalExpenses,
      internetCosts,
      netEarnings,
    }
  }, [projectedClients, resellers, expenses, baseCosts, selectedPeriod])

  return { metrics, filteredClients, projectedClients }
}
