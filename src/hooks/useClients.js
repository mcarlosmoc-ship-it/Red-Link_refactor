import { useEffect, useMemo } from 'react'
import { useBackofficeStore } from '../store/useBackofficeStore.js'
import { useToast } from './useToast.js'

const DEFAULT_TTL = 60_000

export const useClients = ({ autoLoad = true, ttl = DEFAULT_TTL } = {}) => {
  const {
    clients,
    status,
    loadClients,
    createClient,
    toggleClientService,
    clearError,
  } = useBackofficeStore((state) => ({
    clients: state.clients,
    status: state.status.clients,
    loadClients: state.loadClients,
    createClient: state.createClient,
    toggleClientService: state.toggleClientService,
    clearError: () => state.clearResourceError('clients'),
  }))

  const { showToast } = useToast()

  useEffect(() => {
    if (!status?.error) {
      return
    }
    showToast({
      type: 'error',
      title: 'No se pudieron sincronizar los clientes',
      description: status.error,
    })
  }, [status?.error, showToast])

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
    toggleClientService,
  }
}
