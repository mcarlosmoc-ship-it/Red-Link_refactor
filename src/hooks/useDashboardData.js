import { useEffect, useMemo } from 'react'
import { useBackofficeStore } from '../store/useBackofficeStore.js'
import { useToast } from './useToast.js'

const DEFAULT_TTL = 60_000

/**
 * Orquesta la carga de métricas, revendedores y gastos para el dashboard.
 *
 * Durante la inicialización global el store ya solicita estos recursos, por lo que
 * el hook espera a que termine (`isInitializingResources`) antes de lanzar cargas
 * automáticas. Cuando no hay caché en React Query, delega en su mecanismo de
 * deduplicación llamando a `load*` sin `force`.
 */
export const useDashboardData = ({
  autoLoad = true,
  ttl = DEFAULT_TTL,
  periodKey,
  filters,
} = {}) => {
  const {
    metrics,
    resellers,
    expenses,
    metricsStatus,
    resellersStatus,
    expensesStatus,
    loadMetrics,
    loadResellers,
    loadExpenses,
    metricsPeriodKey,
    selectedPeriod,
    currentPeriod,
    metricsFilters,
    clearMetricsError,
    clearResellersError,
    clearExpensesError,
    isInitializingResources,
  } = useBackofficeStore((state) => ({
    metrics: state.metrics,
    resellers: state.resellers,
    expenses: state.expenses,
    metricsStatus: state.status.metrics,
    resellersStatus: state.status.resellers,
    expensesStatus: state.status.expenses,
    loadMetrics: state.loadMetrics,
    loadResellers: state.loadResellers,
    loadExpenses: state.loadExpenses,
    metricsPeriodKey: state.metricsPeriodKey,
    selectedPeriod: state.periods?.selected ?? state.periods?.current ?? null,
    currentPeriod: state.periods?.current ?? state.periods?.selected ?? null,
    metricsFilters: state.metricsFilters,
    clearMetricsError: () => state.clearResourceError('metrics'),
    clearResellersError: () => state.clearResourceError('resellers'),
    clearExpensesError: () => state.clearResourceError('expenses'),
    isInitializingResources: state.isInitializingResources,
  }))

  const { showToast } = useToast()
  const targetPeriod = periodKey ?? selectedPeriod ?? null
  const activeFilters = {
    statusFilter: filters?.statusFilter ?? metricsFilters?.statusFilter ?? 'all',
    searchTerm: filters?.searchTerm ?? metricsFilters?.searchTerm ?? '',
  }

  useEffect(() => {
    if (!metricsStatus?.error) return
    showToast({
      type: 'error',
      title: 'No se pudieron calcular las métricas',
      description: metricsStatus.error,
    })
  }, [metricsStatus?.error, showToast])

  useEffect(() => {
    if (!resellersStatus?.error) return
    showToast({
      type: 'error',
      title: 'No se pudieron cargar los revendedores',
      description: resellersStatus.error,
    })
  }, [resellersStatus?.error, showToast])

  useEffect(() => {
    if (!expensesStatus?.error) return
    showToast({
      type: 'error',
      title: 'No se pudieron cargar los gastos',
      description: expensesStatus.error,
    })
  }, [expensesStatus?.error, showToast])

  useEffect(() => {
    if (!autoLoad) return
    if (isInitializingResources) return
    if (resellersStatus?.isLoading) return
    if (resellersStatus?.lastFetchedAt && Date.now() - resellersStatus.lastFetchedAt < ttl) return

    const hasCache = Boolean(resellersStatus?.lastFetchedAt)

    loadResellers(hasCache ? undefined : { force: false }).catch(() => {})
  }, [
    autoLoad,
    ttl,
    resellersStatus?.isLoading,
    resellersStatus?.lastFetchedAt,
    isInitializingResources,
    loadResellers,
  ])

  useEffect(() => {
    if (!autoLoad) return
    if (isInitializingResources) return
    if (expensesStatus?.isLoading) return
    if (expensesStatus?.lastFetchedAt && Date.now() - expensesStatus.lastFetchedAt < ttl) return

    const hasCache = Boolean(expensesStatus?.lastFetchedAt)

    loadExpenses(hasCache ? undefined : { force: false }).catch(() => {})
  }, [
    autoLoad,
    ttl,
    expensesStatus?.isLoading,
    expensesStatus?.lastFetchedAt,
    isInitializingResources,
    loadExpenses,
  ])

  useEffect(() => {
    if (!autoLoad) return
    if (isInitializingResources) return
    if (metricsStatus?.isLoading) return

    const matchesPeriod = (metricsPeriodKey ?? null) === (targetPeriod ?? null)
    if (matchesPeriod && metricsStatus?.lastFetchedAt && Date.now() - metricsStatus.lastFetchedAt < ttl) {
      return
    }

    const matchesFilters =
      (metricsFilters?.statusFilter ?? 'all') === activeFilters.statusFilter &&
      (metricsFilters?.searchTerm ?? '') === activeFilters.searchTerm

    loadMetrics({
      force:
        Boolean(metricsStatus?.lastFetchedAt) && (!matchesPeriod || !matchesFilters),
      periodKey: targetPeriod,
      statusFilter: activeFilters.statusFilter,
      searchTerm: activeFilters.searchTerm,
      currentPeriod,
    }).catch(() => {})
  }, [
    autoLoad,
    ttl,
    metricsStatus?.isLoading,
    metricsStatus?.lastFetchedAt,
    metricsPeriodKey,
    targetPeriod,
    activeFilters.statusFilter,
    activeFilters.searchTerm,
    metricsFilters?.statusFilter,
    metricsFilters?.searchTerm,
    currentPeriod,
    isInitializingResources,
    loadMetrics,
  ])

  const reloadMetrics = useMemo(
    () =>
      (options = {}) => {
        clearMetricsError()
        return loadMetrics({
          ...options,
          force: true,
          periodKey: targetPeriod,
          statusFilter: activeFilters.statusFilter,
          searchTerm: activeFilters.searchTerm,
          currentPeriod,
        })
      },
    [
      loadMetrics,
      targetPeriod,
      clearMetricsError,
      activeFilters.statusFilter,
      activeFilters.searchTerm,
      currentPeriod,
    ],
  )

  const reloadResellers = useMemo(
    () =>
      (options = {}) => {
        clearResellersError()
        return loadResellers({ ...options, force: true })
      },
    [loadResellers, clearResellersError],
  )

  const reloadExpenses = useMemo(
    () =>
      (options = {}) => {
        clearExpensesError()
        return loadExpenses({ ...options, force: true })
      },
    [loadExpenses, clearExpensesError],
  )

  return {
    metrics,
    resellers,
    expenses,
    targetPeriod,
    status: {
      metrics: metricsStatus,
      resellers: resellersStatus,
      expenses: expensesStatus,
    },
    reloadMetrics,
    reloadResellers,
    reloadExpenses,
  }
}
