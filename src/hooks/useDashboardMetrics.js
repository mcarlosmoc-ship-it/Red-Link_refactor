import { useMemo } from 'react'
import { CLIENT_PRICE, useBackofficeStore } from '../store/useBackofficeStore.js'

const includesSearch = (value, searchTerm) => {
  if (!searchTerm) return true
  return value?.toLowerCase().includes(searchTerm.toLowerCase())
}

export const useDashboardMetrics = ({ statusFilter, searchTerm }) => {
  const { clients, resellers, expenses, baseCosts } = useBackofficeStore((state) => ({
    clients: state.clients,
    resellers: state.resellers,
    expenses: state.expenses,
    baseCosts: state.baseCosts,
  }))

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
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
  }, [clients, statusFilter, searchTerm])

  const metrics = useMemo(() => {
    const totalClients = clients.length
    const paidClients = clients.filter((client) => client.debtMonths === 0).length
    const pendingClients = clients.filter((client) => client.debtMonths > 0).length
    const clientIncome = paidClients * CLIENT_PRICE

    const resellerIncome = resellers.reduce((acc, reseller) => {
      const settlementsGain = reseller.settlements.reduce(
        (total, settlement) => total + (settlement.myGain ?? 0),
        0,
      )
      return acc + settlementsGain
    }, 0)

    const totalExpenses = expenses.reduce((total, expense) => total + (expense.amount ?? 0), 0)
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
  }, [clients, resellers, expenses, baseCosts])

  return { metrics, filteredClients }
}
