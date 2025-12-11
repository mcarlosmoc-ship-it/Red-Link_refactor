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

const EMPTY_VALIDATION_FLAGS = Object.freeze({})

const areMetadataEqual = (previous = {}, next = {}) => {
  const prevFlags = previous.validationFlags ?? EMPTY_VALIDATION_FLAGS
  const nextFlags = next.validationFlags ?? EMPTY_VALIDATION_FLAGS

  return (
    previous.type === next.type &&
    previous.period === next.period &&
    previous.months === next.months &&
    previous.availableStock === next.availableStock &&
    prevFlags.hasIssue === nextFlags.hasIssue &&
    (prevFlags.message ?? '') === (nextFlags.message ?? '') &&
    previous.serviceStatus === next.serviceStatus
  )
}

const normalizeLineMetadata = (item, { activePeriodKey, productLookup, activeServices }) => {
  const previous = item.metadata ?? {}
  const sourceProduct = item.productId ? productLookup?.get?.(item.productId) : null
  const activeService = item.servicePlanId
    ? activeServices?.find((service) => String(service.id) === String(item.servicePlanId))
    : null

  const type = item.type ?? item.metadata?.type ?? previous.type ?? 'product'
  const period = item.metadata?.period ?? activePeriodKey ?? null
  const months = item.metadata?.months ?? item.months ?? previous.months ?? 1
  const availableStock = sourceProduct?.stockQuantity ?? null
  const nextServiceStatus = activeService?.status ?? null

  const previousFlags = previous.validationFlags ?? EMPTY_VALIDATION_FLAGS
  const sourceFlags = item.metadata?.validationFlags ?? previousFlags
  const nextFlags =
    previousFlags === sourceFlags ||
    ((sourceFlags?.hasIssue ?? false) === (previousFlags.hasIssue ?? false) &&
      (sourceFlags?.message ?? '') === (previousFlags.message ?? ''))
      ? previousFlags
      : { hasIssue: Boolean(sourceFlags?.hasIssue), message: sourceFlags?.message ?? '' }

  const nextMetadata = {
    type,
    period,
    months,
    availableStock,
    validationFlags: nextFlags,
    serviceStatus: nextServiceStatus,
  }

  return areMetadataEqual(previous, nextMetadata) ? previous : nextMetadata
}

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
    (item) => {
      const nextMetadata = normalizeLineMetadata(item, {
        activePeriodKey,
        productLookup,
        activeServices,
      })

      return item.metadata === nextMetadata ? item : { ...item, metadata: nextMetadata }
    },
    [activePeriodKey, productLookup, activeServices],
  )

  const updateCart = useCallback(
    (updater) => {
      setCartItems((current) => {
        const next = updater(current)
        let hasChanges = next !== current

        const enriched = next.map((item) => {
          const nextItem = enrichItem(item)
          if (nextItem !== item) {
            hasChanges = true
          }

          return nextItem
        })

        return hasChanges ? enriched : current
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
          const currentFlags = item.metadata?.validationFlags ?? EMPTY_VALIDATION_FLAGS
          const nextHasIssue = Boolean(validationMap[item.id])
          const nextMessage = validationMap[item.id] ?? ''

          if (
            currentFlags.hasIssue === nextHasIssue &&
            (currentFlags.message ?? '') === nextMessage
          ) {
            return item
          }

          hasChanges = true
          const nextFlags = {
            ...currentFlags,
            hasIssue: nextHasIssue,
            message: nextMessage,
          }

          const nextMetadata = normalizeLineMetadata(
            { ...item, metadata: { ...item.metadata, validationFlags: nextFlags } },
            { activePeriodKey, productLookup, activeServices },
          )

          return item.metadata === nextMetadata ? item : { ...item, metadata: nextMetadata }
        })

        if (!hasChanges) {
          return current
        }

        return nextItems
      })
    },
    [activePeriodKey, activeServices, productLookup],
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
    setCartItems((current) => {
      const filtered = current.filter(
        (item) => !SERVICE_LINE_TYPES.has(item.type) || !item.servicePlanId || activeIds.has(String(item.servicePlanId)),
      )

      if (filtered.length === current.length) {
        return current
      }

      return filtered.map(enrichItem)
    })
  }, [activeServices, enrichItem])

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
