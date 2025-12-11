import { describe, expect, it } from 'vitest'
import { sanitizeCartForClientChange } from '../src/hooks/usePosCart.js'

describe('sanitizeCartForClientChange', () => {
  it('removes service lines while preserving product entries', () => {
    const items = [
      { id: 'svc-1', type: 'punctual-service', name: 'Instalación' },
      { id: 'svc-2', type: 'monthly-service', name: 'Mensualidad' },
      { id: 'prod-1', type: 'product', name: 'Router' },
    ]

    const result = sanitizeCartForClientChange(items)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'prod-1', type: 'product' })
  })

  it('returns the same cart when there are no service lines', () => {
    const items = [
      { id: 'prod-1', type: 'product', name: 'Router' },
      { id: 'custom-1', type: 'custom', name: 'Instalación especial' },
    ]

    const result = sanitizeCartForClientChange(items)

    expect(result).toEqual(items)
  })

  it('preserves product details when removing service lines', () => {
    const product = {
      id: 'prod-1',
      type: 'product',
      name: 'Router',
      quantity: 2,
      price: 50,
      metadata: { availableStock: 10, period: 'monthly' },
    }

    const items = [
      { id: 'svc-1', type: 'punctual-service', name: 'Instalación' },
      product,
    ]

    const result = sanitizeCartForClientChange(items)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(product)
    expect(result[0].metadata).toMatchObject({ availableStock: 10, period: 'monthly' })
    expect(result[0]).toMatchObject({ quantity: 2, price: 50 })
  })
})
