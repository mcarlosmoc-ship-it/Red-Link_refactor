import { afterEach, expect } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

expect.extend({
  toBeInTheDocument(received) {
    if (received === null || received === undefined) {
      return {
        pass: false,
        message: () =>
          'Expected element to be connected to the document, but received null or undefined.',
      }
    }

    const isConnected =
      typeof received.isConnected === 'boolean'
        ? received.isConnected
        : Boolean(received.ownerDocument?.contains?.(received))

    const pass = isConnected
    return {
      pass,
      message: () =>
        pass
          ? 'Expected element not to be connected to the document, but it is.'
          : 'Expected element to be connected to the document, but it is not.',
    }
  },
})
