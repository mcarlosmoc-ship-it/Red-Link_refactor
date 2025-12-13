import { describe, expect, it, vi, afterEach } from 'vitest'

const productLookup = new Map([
  ['prod-1', { id: 'prod-1', stockQuantity: 5 }],
])

const activeServices = [{ id: 'service-1', status: 'active' }]

const areDepsEqual = (prev = [], next = []) =>
  prev.length === next.length && next.every((value, index) => Object.is(value, prev[index]))

const createHookHarness = async (hookFactory, { maxRenders = 8 } = {}) => {
  const React = await import('react')
  const internals =
    React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED ??
    (React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
      ReactCurrentDispatcher: { current: null },
    })

  const dispatcherRef = internals.ReactCurrentDispatcher
  const previousDispatcher = dispatcherRef.current

  const setStateSpy = vi.fn()
  const stateStore = []
  const refStore = []
  const effectStore = []
  const renderQueue = []
  const pendingEffects = []
  let cursor = 0
  let renderCount = 0
  let lastResult

  const enqueueRender = () => {
    if (!renderQueue.length) {
      renderQueue.push(true)
    }
  }

  dispatcherRef.current = {
    useCallback: (fn) => fn,
    useRef: (initialValue) => {
      const index = cursor++
      if (refStore[index]) {
        return refStore[index]
      }

      refStore[index] = { current: initialValue }
      return refStore[index]
    },
    useState: (initialValue) => {
      const index = cursor++
      if (!(index in stateStore)) {
        stateStore[index] = initialValue
      }

      const setState = (value) => {
        const nextValue = typeof value === 'function' ? value(stateStore[index]) : value

        if (Object.is(nextValue, stateStore[index])) {
          return stateStore[index]
        }

        stateStore[index] = nextValue
        setStateSpy(nextValue)
        enqueueRender()
        return stateStore[index]
      }

      return [stateStore[index], setState]
    },
    useEffect: (fn, deps) => {
      const index = cursor++
      const previous = effectStore[index]
      const shouldRun = !previous || !deps || !areDepsEqual(previous.deps ?? [], deps)

      if (shouldRun) {
        effectStore[index] = { deps }
        pendingEffects.push(fn)
      }
    },
  }

  const render = () => {
    cursor = 0
    lastResult = hookFactory()
    while (pendingEffects.length) {
      pendingEffects.shift()?.()
    }
  }

  const flushRenders = () => {
    while (renderQueue.length) {
      renderQueue.pop()
      renderCount += 1

      if (renderCount > maxRenders) {
        throw new Error('render limit exceeded')
      }

      render()
    }
  }

  const restore = () => {
    dispatcherRef.current = previousDispatcher
  }

  return {
    render,
    flushRenders,
    restore,
    setStateSpy,
    stateStore,
    getResult: () => lastResult,
  }
}

describe('usePosCart - estabilidad de metadata', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('no dispara setCartItems cuando refreshMetadata no cambia metadata', async () => {
    const { usePosCart } = await import('../src/hooks/usePosCart.js')
    const harness = await createHookHarness(() =>
      usePosCart({
        activePeriodKey: 'monthly',
        productLookup,
        activeServices,
      }),
    )

    try {
      harness.render()
      const { addItem, refreshMetadata } = harness.getResult()

      addItem({
        id: 'line-1',
        productId: 'prod-1',
        quantity: 1,
        type: 'product',
        metadata: { period: 'monthly', months: 1 },
      })

      harness.flushRenders()

      const afterAddCalls = harness.setStateSpy.mock.calls.length

      refreshMetadata()
      harness.flushRenders()

      expect(afterAddCalls).toBe(1)
      expect(harness.setStateSpy.mock.calls.length).toBe(afterAddCalls)
    } finally {
      harness.restore()
    }
  })

  it('reutiliza las mismas referencias para items y metadata entre renders estables', async () => {
    const { usePosCart } = await import('../src/hooks/usePosCart.js')
    const harness = await createHookHarness(() =>
      usePosCart({
        activePeriodKey: 'monthly',
        productLookup,
        activeServices,
      }),
    )

    try {
      harness.render()
      const { addItem, refreshMetadata } = harness.getResult()

      addItem({
        id: 'line-1',
        productId: 'prod-1',
        quantity: 1,
        type: 'product',
        metadata: { period: 'monthly', months: 1 },
      })

      harness.flushRenders()

      const firstResult = harness.getResult()
      const initialCart = firstResult.cartItems
      const initialMetadata = initialCart[0].metadata

      // Simulamos renders subsiguientes con las mismas dependencias para comprobar
      // que la normalización no crea objetos nuevos cuando el input no cambia.
      refreshMetadata()
      harness.flushRenders()
      harness.render()

      const rerenderResult = harness.getResult()
      const rerenderCart = rerenderResult.cartItems

      expect(rerenderCart).toBe(initialCart)
      expect(rerenderCart[0].metadata).toBe(initialMetadata)
    } finally {
      harness.restore()
    }
  })

  it('evita bucles de re-render con dependencias mínimas cambiantes', async () => {
    const { usePosCart } = await import('../src/hooks/usePosCart.js')
    const harness = await createHookHarness(
      () =>
        usePosCart({
          activePeriodKey: 'monthly',
          productLookup,
          activeServices: [...activeServices],
        }),
      { maxRenders: 5 },
    )

    try {
      harness.render()
      const { addItem } = harness.getResult()

      addItem({
        id: 'service-1',
        productId: 'prod-1',
        servicePlanId: 'service-1',
        quantity: 1,
        type: 'monthly-service',
        metadata: { period: 'monthly', months: 1 },
      })

      // El objetivo de esta prueba es evitar la regresión de loops infinitos que
      // disparen "Maximum update depth exceeded" cuando las dependencias cambian
      // mínimamente entre renders (p. ej., un nuevo array de servicios activos).
      harness.flushRenders()

      expect(() => harness.flushRenders()).not.toThrow()
      expect(harness.setStateSpy.mock.calls.length).toBeGreaterThanOrEqual(1)
    } finally {
      harness.restore()
    }
  })

  it('ignora actualizaciones estructuralmente iguales y evita bucles de render', async () => {
    const { usePosCart } = await import('../src/hooks/usePosCart.js')
    const harness = await createHookHarness(() =>
      usePosCart({
        activePeriodKey: 'monthly',
        productLookup,
        activeServices,
      }),
      { maxRenders: 6 },
    )

    try {
      harness.render()
      const { addItem, updateCart } = harness.getResult()

      addItem({
        id: 'line-1',
        productId: 'prod-1',
        quantity: 1,
        price: 100,
        type: 'product',
        metadata: { period: 'monthly', months: 1 },
      })

      harness.flushRenders()

      const setCallsAfterAdd = harness.setStateSpy.mock.calls.length

      // Enviamos un array nuevo pero con el mismo contenido; la comparación
      // estructural debe impedir el setState y, por ende, cualquier bucle.
      updateCart((current) => current.map((item) => ({ ...item })))
      harness.flushRenders()

      expect(harness.setStateSpy.mock.calls.length).toBe(setCallsAfterAdd)
      expect(harness.getResult().cartItems).toBe(harness.stateStore[0])
    } finally {
      harness.restore()
    }
  })
})
