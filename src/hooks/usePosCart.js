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

const areValidationFlagsEqual = (previous = EMPTY_VALIDATION_FLAGS, next = EMPTY_VALIDATION_FLAGS) =>
  previous === next ||
  (previous.hasIssue === next.hasIssue && (previous.message ?? '') === (next.message ?? ''))

const areMetadataEqual = (previous = {}, next = {}) =>
  previous === next ||
  (previous.type === next.type &&
    previous.period === next.period &&
    previous.months === next.months &&
    previous.availableStock === next.availableStock &&
    areValidationFlagsEqual(previous.validationFlags, next.validationFlags) &&
    previous.serviceStatus === next.serviceStatus)

const areCartItemsEqual = (previous = [], next = []) => {
  if (previous === next || previous.length !== next.length) {
    return previous === next && previous.length === next.length
  }

  for (let index = 0; index < previous.length; index += 1) {
    const prevItem = previous[index]
    const nextItem = next[index]

    if (
      prevItem === nextItem ||
      (prevItem.id === nextItem.id &&
        prevItem.type === nextItem.type &&
        prevItem.productId === nextItem.productId &&
        prevItem.servicePlanId === nextItem.servicePlanId &&
        prevItem.quantity === nextItem.quantity &&
        prevItem.price === nextItem.price &&
        areMetadataEqual(prevItem.metadata, nextItem.metadata))
    ) {
      continue
    }

    return false
  }

  return true
}

const normalizeLineMetadata = (
  item,
  { activePeriodKey, productLookup, activeServices, metadataCache },
) => {
  // Reutilizamos cualquier metadata previa o de caché cuando los valores coinciden
  // para mantener la identidad de objetos/flags y evitar re-renders en cascada.
  const cached = metadataCache?.get?.(item.id)
  const previous = item.metadata ?? cached ?? {}
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

  const stableMetadata = areMetadataEqual(previous, nextMetadata)
    ? previous
    : areMetadataEqual(cached, nextMetadata)
      ? cached
      : nextMetadata

  if (metadataCache) {
    metadataCache.set(item.id, stableMetadata)
  }

  return stableMetadata
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
  const metadataCacheRef = useRef(new Map())
  const previousActiveServiceIdsRef = useRef()

  const enrichItem = useCallback(
    (item) => {
      const nextMetadata = normalizeLineMetadata(item, {
        activePeriodKey,
        productLookup,
        activeServices,
        metadataCache: metadataCacheRef.current,
      })

      return item.metadata === nextMetadata ? item : { ...item, metadata: nextMetadata }
    },
    [activePeriodKey, productLookup, activeServices],
  )

  const updateCart = useCallback(
    (updater) => {
      setCartItems((current) => {
        const next = updater(current)
        const enriched = next.map((item) => enrichItem(item))

        return areCartItemsEqual(current, enriched) ? current : enriched
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
    // Solo recalculamos metadata cuando hay cambios reales; el cache interno
    // devuelve las mismas referencias para evitar re-renders y bucles de
    // normalización al enviar objetos nuevos en cada render.
    setCartItems((current) => {
      if (!current.length) {
        return current
      }

      const nextItems = current.map((item) => {
        const nextMetadata = normalizeLineMetadata(item, {
          activePeriodKey,
          productLookup,
          activeServices,
          metadataCache: metadataCacheRef.current,
        })

        if (areMetadataEqual(item.metadata, nextMetadata)) {
          return item
        }

        return { ...item, metadata: nextMetadata }
      })

      return areCartItemsEqual(current, nextItems) ? current : nextItems
    })
  }, [activePeriodKey, activeServices, productLookup])

  const updateValidationFlags = useCallback(
    (validationMap = {}) => {
      setCartItems((current) => {
        let hasChanges = false

        for (const item of current) {
          const currentFlags = item.metadata?.validationFlags ?? EMPTY_VALIDATION_FLAGS
          const nextHasIssue = Boolean(validationMap[item.id])
          const nextMessage = validationMap[item.id] ?? ''

          // Preservamos los flags actuales cuando coinciden para evitar
          // reconstruir líneas y disparar renders innecesarios.
          if (
            currentFlags.hasIssue !== nextHasIssue ||
            (currentFlags.message ?? '') !== nextMessage
          ) {
            hasChanges = true
            break
          }
        }

        if (!hasChanges) {
          return current
        }

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

          const nextFlags = areValidationFlagsEqual(currentFlags, {
            ...currentFlags,
            hasIssue: nextHasIssue,
            message: nextMessage,
          })
            ? currentFlags
            : {
                ...currentFlags,
                hasIssue: nextHasIssue,
                message: nextMessage,
              }

          const nextMetadata = normalizeLineMetadata(
            { ...item, metadata: { ...item.metadata, validationFlags: nextFlags } },
            {
              activePeriodKey,
              productLookup,
              activeServices,
              metadataCache: metadataCacheRef.current,
            },
          )

          return item.metadata === nextMetadata ? item : { ...item, metadata: nextMetadata }
        })

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
    const nextIds = activeServices?.map((service) => String(service.id)) ?? []
    const previousIds = previousActiveServiceIdsRef.current

    if (previousIds && nextIds.length === previousIds.length && nextIds.every((id, index) => id === previousIds[index])) {
      return
    }

    previousActiveServiceIdsRef.current = nextIds

    if (!nextIds.length) {
      return
    }

    // El guardado de ids previos nos asegura que este efecto solo filtra el
    // carrito cuando realmente cambian los servicios activos, conservando
    // identidades para evitar renders en bucle.
    const activeIds = new Set(nextIds)
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
