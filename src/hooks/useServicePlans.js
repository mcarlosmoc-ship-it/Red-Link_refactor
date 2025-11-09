import { useEffect, useMemo } from 'react'
import { useBackofficeStore } from '../store/useBackofficeStore.js'

const DEFAULT_TTL = 60_000

export const useServicePlans = ({ autoLoad = true, ttl = DEFAULT_TTL } = {}) => {
  const {
    servicePlans,
    status,
    loadServicePlans,
    createServicePlan,
    updateServicePlan,
    deleteServicePlan,
    clearError,
  } = useBackofficeStore((state) => ({
    servicePlans: state.servicePlans,
    status: state.status.servicePlans,
    loadServicePlans: state.loadServicePlans,
    createServicePlan: state.createServicePlan,
    updateServicePlan: state.updateServicePlan,
    deleteServicePlan: state.deleteServicePlan,
    clearError: () => state.clearResourceError('servicePlans'),
  }))

  useEffect(() => {
    if (!autoLoad) {
      return
    }
    if (status?.isLoading || status?.isMutating) {
      return
    }
    if (status?.lastFetchedAt && Date.now() - status.lastFetchedAt < ttl) {
      return
    }

    loadServicePlans({ force: !status?.lastFetchedAt }).catch(() => {
      // handled by store
    })
  }, [autoLoad, ttl, status?.isLoading, status?.isMutating, status?.lastFetchedAt, loadServicePlans])

  const reload = useMemo(
    () =>
      (options = {}) => {
        clearError()
        return loadServicePlans({ ...options, force: true })
      },
    [loadServicePlans, clearError],
  )

  return {
    servicePlans,
    status,
    isLoading: Boolean(status?.isLoading),
    isMutating: Boolean(status?.isMutating),
    loadServicePlans,
    reload,
    createServicePlan,
    updateServicePlan,
    deleteServicePlan,
  }
}

export default useServicePlans
