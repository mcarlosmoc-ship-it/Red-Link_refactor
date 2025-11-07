import { useEffect, useMemo } from 'react'
import { useBackofficeStore } from '../store/useBackofficeStore.js'

const DEFAULT_TTL = 60_000

export const useAccountManagement = ({ autoLoad = true, ttl = DEFAULT_TTL } = {}) => {
  const {
    principalAccounts,
    clientAccounts,
    statusPrincipal,
    statusClients,
    loadPrincipalAccounts,
    loadClientAccounts,
    createClientAccount,
    registerClientAccountPayment,
    updateClientAccountPassword,
    clearPrincipalError,
    clearClientAccountsError,
  } = useBackofficeStore((state) => ({
    principalAccounts: state.principalAccounts,
    clientAccounts: state.clientAccounts,
    statusPrincipal: state.status.principalAccounts,
    statusClients: state.status.clientAccounts,
    loadPrincipalAccounts: state.loadPrincipalAccounts,
    loadClientAccounts: state.loadClientAccounts,
    createClientAccount: state.createClientAccount,
    registerClientAccountPayment: state.registerClientAccountPayment,
    updateClientAccountPassword: state.updateClientAccountPassword,
    clearPrincipalError: () => state.clearResourceError('principalAccounts'),
    clearClientAccountsError: () => state.clearResourceError('clientAccounts'),
  }))

  useEffect(() => {
    if (!autoLoad) {
      return
    }

    if (statusPrincipal?.isLoading || statusPrincipal?.isMutating) {
      return
    }

    if (statusPrincipal?.lastFetchedAt && Date.now() - statusPrincipal.lastFetchedAt < ttl) {
      return
    }

    loadPrincipalAccounts({ force: !statusPrincipal?.lastFetchedAt }).catch(() => {
      // El estado ya refleja el error
    })
  }, [autoLoad, ttl, statusPrincipal?.isLoading, statusPrincipal?.isMutating, statusPrincipal?.lastFetchedAt, loadPrincipalAccounts])

  useEffect(() => {
    if (!autoLoad) {
      return
    }

    if (statusClients?.isLoading || statusClients?.isMutating) {
      return
    }

    if (statusClients?.lastFetchedAt && Date.now() - statusClients.lastFetchedAt < ttl) {
      return
    }

    loadClientAccounts({ force: !statusClients?.lastFetchedAt }).catch(() => {
      // El estado ya refleja el error
    })
  }, [autoLoad, ttl, statusClients?.isLoading, statusClients?.isMutating, statusClients?.lastFetchedAt, loadClientAccounts])

  const reload = useMemo(
    () =>
      (options = {}) => {
        clearPrincipalError()
        clearClientAccountsError()
        return Promise.all([
          loadPrincipalAccounts({ ...options, force: true }),
          loadClientAccounts({ ...options, force: true }),
        ])
      },
    [
      loadPrincipalAccounts,
      loadClientAccounts,
      clearPrincipalError,
      clearClientAccountsError,
    ],
  )

  return {
    principalAccounts,
    clientAccounts,
    status: {
      principalAccounts: statusPrincipal,
      clientAccounts: statusClients,
    },
    loadPrincipalAccounts,
    loadClientAccounts,
    reload,
    createClientAccount,
    registerClientAccountPayment,
    updateClientAccountPassword,
  }
}

export default useAccountManagement
