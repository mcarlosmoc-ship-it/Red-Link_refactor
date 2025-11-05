import { useEffect, useMemo } from 'react'
import { useBackofficeStore } from '../store/useBackofficeStore.js'

const DEFAULT_TTL = 60_000

export const usePayments = ({ autoLoad = true, ttl = DEFAULT_TTL, periodKey } = {}) => {
  const {
    payments,
    status,
    paymentsPeriodKey,
    loadPayments,
    clearError,
    selectedPeriod,
  } = useBackofficeStore((state) => ({
    payments: state.payments,
    status: state.status.payments,
    paymentsPeriodKey: state.paymentsPeriodKey,
    loadPayments: state.loadPayments,
    clearError: () => state.clearResourceError('payments'),
    selectedPeriod: state.periods?.selected ?? state.periods?.current ?? null,
  }))

  const targetPeriod = periodKey ?? selectedPeriod ?? null

  useEffect(() => {
    if (!autoLoad) {
      return
    }
    if (status?.isLoading) {
      return
    }

    const matchesPeriod = (paymentsPeriodKey ?? null) === (targetPeriod ?? null)
    if (matchesPeriod && status?.lastFetchedAt && Date.now() - status.lastFetchedAt < ttl) {
      return
    }

    loadPayments({ force: !status?.lastFetchedAt || !matchesPeriod, periodKey: targetPeriod }).catch(() => {
      // manejado por el efecto de error
    })
  }, [
    autoLoad,
    ttl,
    status?.isLoading,
    status?.lastFetchedAt,
    paymentsPeriodKey,
    targetPeriod,
    selectedPeriod,
    loadPayments,
  ])

  const reload = useMemo(
    () =>
      (options = {}) => {
        clearError()
        return loadPayments({ ...options, force: true, periodKey: targetPeriod })
      },
    [loadPayments, targetPeriod, clearError],
  )

  return {
    payments,
    status,
    isLoading: Boolean(status?.isLoading),
    loadPayments,
    reload,
  }
}
