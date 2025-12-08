import { describe, expect, it } from 'vitest'

import { DEFAULT_COMPLEMENTARY_TYPES, evaluateCartValidation } from '../src/utils/cartValidation.js'

const activeClient = {
  id: 'client-1',
  services: [{ id: 'service-1', status: 'active' }],
  zoneId: 5,
}

describe('evaluateCartValidation', () => {
  it('permite un carrito con solo productos cuando hay stock suficiente', () => {
    const cartItems = [
      { id: 'line-1', type: 'product', productId: 'prod-1', quantity: 1 },
    ]
    const productLookup = new Map([[
      'prod-1',
      { id: 'prod-1', stockQuantity: 10 },
    ]])

    const result = evaluateCartValidation({ cartItems, productLookup })

    expect(result).toEqual({})
  })

  it('marca stock insuficiente en productos', () => {
    const cartItems = [
      { id: 'line-1', type: 'product', productId: 'prod-1', quantity: 3 },
    ]
    const productLookup = new Map([[
      'prod-1',
      { id: 'prod-1', stockQuantity: 2 },
    ]])

    const result = evaluateCartValidation({ cartItems, productLookup })

    expect(result).toEqual({ 'line-1': 'Stock insuficiente: quedan 2' })
  })

  it('bloquea servicios mensuales sin contrato activo', () => {
    const cartItems = [
      {
        id: 'service-line-1',
        type: 'monthly-service',
        servicePlanId: 'service-1',
        metadata: { period: '2024-01' },
      },
    ]
    const selectedClient = { id: 'client-2', services: [{ id: 'service-1', status: 'pending' }] }

    const result = evaluateCartValidation({ cartItems, selectedClient })

    expect(result).toEqual({
      'service-line-1': 'El cliente no tiene un contrato activo para facturar este servicio.',
    })
  })

  it('identifica duplicados de periodo para múltiples servicios', () => {
    const cartItems = [
      {
        id: 'service-line-1',
        type: 'monthly-service',
        servicePlanId: 'service-1',
        metadata: { period: '2024-02' },
      },
      {
        id: 'service-line-2',
        type: 'monthly-service',
        servicePlanId: 'service-2',
        metadata: { period: '2024-02' },
      },
    ]

    const duplicateServiceReceiptMap = {
      'service-2': { folio: 'F-100', period: '2024-02' },
    }

    const result = evaluateCartValidation({
      cartItems,
      selectedClient: activeClient,
      clientServicesByClient: { 'client-1': activeClient.services },
      activePeriodKey: '2024-02',
      duplicateServiceReceiptMap,
    })

    expect(result).toMatchObject({
      'service-line-2': expect.stringContaining('Ya existe el folio F-100'),
    })
    expect(result['service-line-1']).toBeUndefined()
  })

  it('mezcla productos y servicios manteniendo las validaciones correspondientes', () => {
    const cartItems = [
      { id: 'line-1', type: 'product', productId: 'prod-1', quantity: 5 },
      {
        id: 'service-line-1',
        type: 'monthly-service',
        servicePlanId: 'service-1',
        metadata: { period: '2024-03' },
      },
    ]
    const productLookup = new Map([[
      'prod-1',
      { id: 'prod-1', stockQuantity: 3 },
    ]])

    const result = evaluateCartValidation({
      cartItems,
      selectedClient: activeClient,
      clientServicesByClient: { 'client-1': activeClient.services },
      activePeriodKey: '2024-03',
      productLookup,
      complementaryTypes: DEFAULT_COMPLEMENTARY_TYPES,
    })

    expect(result).toEqual({ 'line-1': 'Stock insuficiente: quedan 3' })
  })
})

