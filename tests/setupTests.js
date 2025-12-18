import { afterEach, expect } from 'vitest'
import React from 'react'
import { cleanup } from '@testing-library/react'

// React lanza advertencias sobre useLayoutEffect al renderizar en modo servidor
// (verbo por renderToStaticMarkup en los mocks de testing-library). Para los
// tests preferimos silenciar esos avisos y delegar en useEffect, ya que no hay
// un DOM real en este entorno.
React.useLayoutEffect = React.useEffect

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
