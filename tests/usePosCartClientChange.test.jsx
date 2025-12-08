import { describe, expect, it, vi } from 'vitest'

import { resolveClientChangeForCart } from '../src/hooks/usePosCart.js'

describe('usePosCart - cambio de cliente con carrito activo', () => {
  it('solicita confirmación y limpia servicios al cambiar de cliente', () => {
    const cartItems = [
      { id: 'service-line', type: 'monthly-service', quantity: 1 },
      { id: 'product-line', type: 'product', quantity: 1 },
    ]
    const onClientCleared = vi.fn()
    const onRevertClient = vi.fn()
    const confirmSpy = vi.fn().mockReturnValue(true)

    const result = resolveClientChangeForCart({
      cartItems,
      previousClientId: 'client-1',
      nextClientId: 'client-2',
      confirmClientChange: confirmSpy,
      onClientCleared,
      onRevertClient,
    })

    expect(confirmSpy).toHaveBeenCalled()
    expect(onClientCleared).toHaveBeenCalled()
    expect(onRevertClient).not.toHaveBeenCalled()
    expect(result.shouldUpdatePrevious).toBe(true)
    expect(result.nextCartItems).toEqual([{ id: 'product-line', type: 'product', quantity: 1 }])
  })
})
