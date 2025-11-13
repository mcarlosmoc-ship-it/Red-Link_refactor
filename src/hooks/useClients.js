import { useEffect, useMemo } from 'react'
import { useBackofficeStore } from '../store/useBackofficeStore.js'

const DEFAULT_TTL = 60_000

/**
 * Gestiona el estado de clientes y coordina la carga automática de datos.
 *
 * Al inicializar el backoffice el store ya dispara `loadClients()`, por lo que este
 * hook observa `isInitializingResources` para evitar solicitudes duplicadas.
 * Cuando no existe caché (`status.lastFetchedAt` vacío) realiza la primera carga sin
 * `force` para que React Query pueda deducir llamadas concurrentes al mismo recurso.
 */
export const useClients = ({ autoLoad = true, ttl = DEFAULT_TTL } = {}) => {
  const {
    clients,
    status,
    loadClients,
    createClient,
    createClientService,
    bulkAssignClientServices,
    toggleClientService,
    updateClientServiceStatus,
    deleteClient,
    importClients,
    clearError,
    isInitializingResources,
  } = useBackofficeStore((state) => ({
    clients: state.clients,
    status: state.status.clients,
    loadClients: state.loadClients,
    createClient: state.createClient,
    createClientService: state.createClientService,
    bulkAssignClientServices: state.bulkAssignClientServices,
    toggleClientService: state.toggleClientService,
    updateClientServiceStatus: state.updateClientServiceStatus,
    deleteClient: state.deleteClient,
    importClients: state.importClients,
    clearError: () => state.clearResourceError('clients'),
    isInitializingResources: state.isInitializingResources,
  }))

  useEffect(() => {
    if (!autoLoad) {
      return
    }
    if (isInitializingResources) {
      return
    }
    if (status?.isLoading || status?.isMutating) {
      return
    }
    if (status?.lastFetchedAt && Date.now() - status.lastFetchedAt < ttl) {
      return
    }

    const hasCache = Boolean(status?.lastFetchedAt)

    loadClients(hasCache ? undefined : { force: false }).catch(() => {
      // el hook de error ya muestra retroalimentación
    })
  }, [
    autoLoad,
    ttl,
    status?.isLoading,
    status?.isMutating,
    status?.lastFetchedAt,
    isInitializingResources,
    loadClients,
  ])

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
    bulkAssignClientServices,
    toggleClientService,
    updateClientServiceStatus,
    deleteClient,
    importClients,
  }
}
