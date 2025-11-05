import { afterEach, expect } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

expect.extend({
  toBeInTheDocument(received) {
    const pass = received !== null && received !== undefined
    return {
      pass,
      message: () =>
        pass
          ? 'Expected element not to be in the rendered output.'
          : 'Expected element to be in the rendered output.',
    }
  },
})
