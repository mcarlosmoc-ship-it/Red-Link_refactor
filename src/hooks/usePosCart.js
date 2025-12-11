import { useCallback, useEffect, useRef, useState } from 'react'

const SERVICE_LINE_TYPES = new Set(['punctual-service', 'monthly-service'])

const CLIENT_CHANGE_MESSAGE =
  'Cambiar de cliente reiniciará los servicios del carrito. ¿Deseas continuar?'

export const sanitizeCartForClientChange = (items = []) =>
  items.filter((item) => !SERVICE_LINE_TYPES.has(item.type))

export const resolveClientChangeForCart = ({
  cartItems = [],
  previousClientId = '',
  nextClientId = '',
  confirmClientChange = (message) => window.confirm(message),
  onClientCleared,
  onRevertClient,
}) => {
  const hasClientChanged = previousClientId !== nextClientId

  if (!hasClientChanged) {
    return { nextCartItems: cartItems, shouldUpdatePrevious: false }
  }

  const hasServiceLines = cartItems.some((item) => SERVICE_LINE_TYPES.has(item.type))

  if (!hasServiceLines) {
    return { nextCartItems: cartItems, shouldUpdatePrevious: true }
  }

  const confirmed = confirmClientChange(CLIENT_CHANGE_MESSAGE)

  if (!confirmed) {
    onRevertClient?.(previousClientId)
    return { nextCartItems: cartItems, shouldUpdatePrevious: false }
  }

  const sanitizedItems = sanitizeCartForClientChange(cartItems)

  if (sanitizedItems.length !== cartItems.length) {
    onClientCleared?.()
  }

  return { nextCartItems: sanitizedItems, shouldUpdatePrevious: true }
}

const normalizeLineMetadata = (item, { activePeriodKey, productLookup, activeServices }) => {
  const sourceProduct = item.productId ? productLookup?.get?.(item.productId) : null
  const activeService = item.servicePlanId
    ? activeServices?.find((service) => String(service.id) === String(item.servicePlanId))
    : null

  return {
    type: item.type ?? item.metadata?.type ?? 'product',
    period: item.metadata?.period ?? activePeriodKey ?? null,
    months: item.metadata?.months ?? item.months ?? 1,
    availableStock: sourceProduct?.stockQuantity ?? null,
    validationFlags: item.metadata?.validationFlags ?? {},
    serviceStatus: activeService?.status ?? null,
  }
}

const areMetadataEqual = (previous = {}, next = {}) =>
  previous.type === next.type &&
  previous.period === next.period &&
  previous.months === next.months &&
  previous.availableStock === next.availableStock &&
  previous.validationFlags === next.validationFlags &&
  previous.serviceStatus === next.serviceStatus

export const usePosCart = ({
  selectedClientId,
  activePeriodKey,
  productLookup,
  activeServices,
  onRevertClient,
  onClientCleared,
  confirmClientChange = (message) => window.confirm(message),
} = {}) => {
  const [cartItems, setCartItems] = useState([])
  const previousClientIdRef = useRef(selectedClientId ?? '')

  const enrichItem = useCallback(
    (item) => ({
      ...item,
      metadata: normalizeLineMetadata(item, { activePeriodKey, productLookup, activeServices }),
    }),
    [activePeriodKey, productLookup, activeServices],
  )

  const updateCart = useCallback(
    (updater) => {
      setCartItems((current) => {
        const next = updater(current)
        return next.map(enrichItem)
      })
    },
    [enrichItem],
  )

  const addItem = useCallback(
    (item) => {
      updateCart((current) => [...current, item])
    },
    [updateCart],
  )

  const updateItemQuantity = useCallback(
    (lineId, delta, clampFn = (value) => value) => {
      updateCart((current) =>
        current
          .map((item) =>
            item.id === lineId ? { ...item, quantity: clampFn(item.quantity + delta) } : item,
          )
          .filter((item) => item.quantity > 0),
      )
    },
    [updateCart],
  )

  const setItemQuantity = useCallback(
    (lineId, quantity, clampFn = (value) => value) => {
      updateCart((current) =>
        current
          .map((item) => (item.id === lineId ? { ...item, quantity: clampFn(quantity) } : item))
          .filter((item) => item.quantity > 0),
      )
    },
    [updateCart],
  )

  const removeItem = useCallback(
    (lineId) => {
      updateCart((current) => current.filter((item) => item.id !== lineId))
    },
    [updateCart],
  )

  const refreshMetadata = useCallback(() => {
    setCartItems((current) => {
      if (!current.length) {
        return current
      }

      let hasChanges = false

      const nextItems = current.map((item) => {
        const nextMetadata = normalizeLineMetadata(item, { activePeriodKey, productLookup, activeServices })

        if (areMetadataEqual(item.metadata, nextMetadata)) {
          return item
        }

        hasChanges = true
        return { ...item, metadata: nextMetadata }
      })

      return hasChanges ? nextItems : current
    })
  }, [activePeriodKey, activeServices, productLookup])

  const updateValidationFlags = useCallback(
    (validationMap = {}) => {
      setCartItems((current) => {
        let hasChanges = false

        const nextItems = current.map((item) => {
          const currentFlags = item.metadata?.validationFlags ?? {}
          const nextHasIssue = Boolean(validationMap[item.id])
          const nextMessage = validationMap[item.id] ?? ''

          if (
            currentFlags.hasIssue === nextHasIssue &&
            (currentFlags.message ?? '') === nextMessage
          ) {
            return item
          }

          hasChanges = true
          return {
            ...item,
            metadata: {
              ...item.metadata,
              validationFlags: {
                ...currentFlags,
                hasIssue: nextHasIssue,
                message: nextMessage,
              },
            },
          }
        })

        if (!hasChanges) {
          return current
        }

        return nextItems.map(enrichItem)
      })
    },
    [enrichItem],
  )

  useEffect(() => {
    refreshMetadata()
  }, [refreshMetadata])

  useEffect(() => {
    const previousId = previousClientIdRef.current
    const nextId = selectedClientId ?? ''

    if (previousId === nextId) {
      return
    }

    setCartItems((currentCart) => {
      const { nextCartItems, shouldUpdatePrevious } = resolveClientChangeForCart({
        cartItems: currentCart,
        previousClientId: previousId,
        nextClientId: nextId,
        confirmClientChange,
        onClientCleared,
        onRevertClient,
      })

      if (!shouldUpdatePrevious) {
        return currentCart
      }

      previousClientIdRef.current = nextId
      return nextCartItems.map(enrichItem)
    })
  }, [confirmClientChange, enrichItem, onClientCleared, onRevertClient, selectedClientId])

  useEffect(() => {
    if (!activeServices?.length) {
      return
    }

    const activeIds = new Set(activeServices.map((service) => String(service.id)))
    updateCart((current) =>
      current.filter(
        (item) => !SERVICE_LINE_TYPES.has(item.type) || !item.servicePlanId || activeIds.has(String(item.servicePlanId)),
      ),
    )
  }, [activeServices, updateCart])

  return {
    cartItems,
    addItem,
    updateCart,
    updateItemQuantity,
    setItemQuantity,
    removeItem,
    refreshMetadata,
    updateValidationFlags,
  }
}

export default usePosCart
