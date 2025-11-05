import { useCallback, useEffect, useRef } from 'react'
import { useBackofficeStore } from '../store/useBackofficeStore.js'

export const useInitializeBackoffice = () => {
  const { initialize, syncCurrentPeriod, initializeStatus } = useBackofficeStore((state) => ({
    initialize: state.initialize,
    syncCurrentPeriod: state.syncCurrentPeriod,
    initializeStatus: state.status.initialize,
  }))
  const hasInitializedRef = useRef(false)

  useEffect(() => {
    syncCurrentPeriod()
  }, [syncCurrentPeriod])

  useEffect(() => {
    if (hasInitializedRef.current) {
      return
    }

    hasInitializedRef.current = true
    initialize().catch(() => {
      // el estado de la tienda maneja los errores
    })
  }, [initialize])

  const retry = useCallback(() => initialize({ force: true }), [initialize])

  return {
    isLoading: Boolean(initializeStatus?.isLoading),
    hasError: Boolean(initializeStatus?.error),
    retry,
    status: initializeStatus,
  }
}

export default useInitializeBackoffice
