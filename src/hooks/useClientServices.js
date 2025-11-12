import { useEffect, useMemo } from 'react'
import { useBackofficeStore } from '../store/useBackofficeStore.js'

const DEFAULT_TTL = 60_000

export const useClientServices = ({ autoLoad = true, ttl = DEFAULT_TTL } = {}) => {
  const {
    clientServices,
    status,
    loadClientServices,
    createClientService,
    bulkAssignClientServices,
    updateClientService,
    deleteClientService,
    clearError,
  } = useBackofficeStore((state) => ({
    clientServices: state.clientServices,
    status: state.status.clientServices,
    loadClientServices: state.loadClientServices,
    createClientService: state.createClientService,
    bulkAssignClientServices: state.bulkAssignClientServices,
    updateClientService: state.updateClientService,
    deleteClientService: state.deleteClientService,
    clearError: () => state.clearResourceError('clientServices'),
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

    loadClientServices({ force: !status?.lastFetchedAt }).catch(() => {
      // el estado ya controla los errores
    })
  }, [autoLoad, ttl, status?.isLoading, status?.isMutating, status?.lastFetchedAt, loadClientServices])

  const reload = useMemo(
    () =>
      (options = {}) => {
        clearError()
        return loadClientServices({ ...options, force: true })
      },
    [loadClientServices, clearError],
  )

  return {
    clientServices,
    status,
    isLoading: Boolean(status?.isLoading),
    isMutating: Boolean(status?.isMutating),
    loadClientServices,
    reload,
    createClientService,
    bulkAssignClientServices,
    updateClientService,
    deleteClientService,
  }
}

export default useClientServices
