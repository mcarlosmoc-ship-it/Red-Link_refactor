import { describe, expect, it, vi, afterEach } from 'vitest'

const productLookup = new Map([
  ['prod-1', { id: 'prod-1', stockQuantity: 5 }],
])

const activeServices = [{ id: 'service-1', status: 'active' }]

describe('usePosCart - estabilidad de metadata', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('no dispara actualizaciones repetidas con props estables', async () => {
    const setStateSpy = vi.fn()
    const React = await import('react')
    const internals =
      React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED ??
      (React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
        ReactCurrentDispatcher: { current: null },
      })
    const dispatcherRef = internals.ReactCurrentDispatcher
    const previousDispatcher = dispatcherRef.current
    const stateStore = []

    dispatcherRef.current = {
      useCallback: (fn) => fn,
      useEffect: (fn) => fn(),
      useRef: (initialValue) => ({ current: initialValue }),
      useState: (initialValue) => {
        const index = stateStore.length
        stateStore.push(initialValue)

        const setState = (value) => {
          const nextValue = typeof value === 'function' ? value(stateStore[index]) : value

          if (Object.is(nextValue, stateStore[index])) {
            return stateStore[index]
          }

          stateStore[index] = nextValue
          setStateSpy(nextValue)
          return stateStore[index]
        }

        return [stateStore[index], setState]
      },
    }

    try {
      const { usePosCart } = await import('../src/hooks/usePosCart.js')

      const { addItem, refreshMetadata } = usePosCart({
        activePeriodKey: 'monthly',
        productLookup,
        activeServices,
      })

      const initialCallCount = setStateSpy.mock.calls.length

      addItem({
        id: 'line-1',
        productId: 'prod-1',
        quantity: 1,
        type: 'product',
        metadata: { period: 'monthly', months: 1 },
      })

      const afterAddCallCount = setStateSpy.mock.calls.length

      refreshMetadata()

      expect(initialCallCount).toBe(0)
      expect(afterAddCallCount).toBe(1)
      expect(setStateSpy.mock.calls.length).toBe(afterAddCallCount)
    } finally {
      dispatcherRef.current = previousDispatcher
    }
  })
})
