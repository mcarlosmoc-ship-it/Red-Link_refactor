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
    setCartItems((current) => current.map(enrichItem))
  }, [enrichItem])

  const updateValidationFlags = useCallback(
    (validationMap = {}) => {
      updateCart((current) =>
        current.map((item) => ({
          ...item,
          metadata: {
            ...item.metadata,
            validationFlags: {
              ...item.metadata?.validationFlags,
              hasIssue: Boolean(validationMap[item.id]),
              message: validationMap[item.id] ?? '',
            },
          },
        })),
      )
    },
    [updateCart],
  )

  useEffect(() => {
    refreshMetadata()
  }, [refreshMetadata])

  useEffect(() => {
    const previousId = previousClientIdRef.current

    const { nextCartItems, shouldUpdatePrevious } = resolveClientChangeForCart({
      cartItems,
      previousClientId: previousId,
      nextClientId: selectedClientId ?? '',
      confirmClientChange,
      onClientCleared,
      onRevertClient,
    })

    if (shouldUpdatePrevious) {
      updateCart(() => nextCartItems)
      previousClientIdRef.current = selectedClientId ?? ''
    }
  }, [cartItems, confirmClientChange, onClientCleared, onRevertClient, selectedClientId, updateCart])

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
