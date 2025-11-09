import { useEffect, useMemo } from 'react'
import { useBackofficeStore } from '../store/useBackofficeStore.js'

const DEFAULT_TTL = 60_000

export const useClients = ({ autoLoad = true, ttl = DEFAULT_TTL } = {}) => {
  const {
    clients,
    status,
    loadClients,
    createClient,
    createClientService,
    toggleClientService,
    updateClientServiceStatus,
    deleteClient,
    importClients,
    clearError,
  } = useBackofficeStore((state) => ({
    clients: state.clients,
    status: state.status.clients,
    loadClients: state.loadClients,
    createClient: state.createClient,
    createClientService: state.createClientService,
    toggleClientService: state.toggleClientService,
    updateClientServiceStatus: state.updateClientServiceStatus,
    deleteClient: state.deleteClient,
    importClients: state.importClients,
    clearError: () => state.clearResourceError('clients'),
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

    loadClients({ force: !status?.lastFetchedAt }).catch(() => {
      // el hook de error ya muestra retroalimentación
    })
  }, [autoLoad, ttl, status?.isLoading, status?.isMutating, status?.lastFetchedAt, loadClients])

  const reload = useMemo(
    () =>
      (options = {}) => {
        clearError()
        return loadClients({ ...options, force: true })
      },
    [loadClients, clearError],
  )

  return {
    clients,
    status,
    isLoading: Boolean(status?.isLoading),
    isMutating: Boolean(status?.isMutating),
    loadClients,
    reload,
    createClient,
    createClientService,
    toggleClientService,
    updateClientServiceStatus,
    deleteClient,
    importClients,
  }
}
