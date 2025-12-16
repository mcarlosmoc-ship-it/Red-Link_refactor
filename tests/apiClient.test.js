import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalLocation = globalThis.location

const setMockLocation = ({ protocol = 'http:', hostname = 'localhost', port = '' } = {}) => {
  const origin = `${protocol}//${hostname}${port ? `:${port}` : ''}`
  // Vitest/JSDOM allows overriding location for testing purposes.
  delete globalThis.location
  globalThis.location = { protocol, hostname, port, origin }
}

beforeEach(() => {
  vi.resetModules()
  setMockLocation()
})

afterEach(() => {
  delete globalThis.location
  if (originalLocation) {
    globalThis.location = originalLocation
  }
})

describe('resolveBrowserDefaultBaseUrl', () => {
  it('forces the backend port when running from a Vite dev server port', async () => {
    setMockLocation({ hostname: 'localhost', port: '5173' })
    const { resolveBrowserDefaultBaseUrl } = await import('../src/services/apiClient.js')

    expect(resolveBrowserDefaultBaseUrl()).toBe('http://localhost:8000')
  })

  it('prefers the backend port when static assets are served locally on a different port', async () => {
    setMockLocation({ hostname: 'localhost', port: '3000' })
    const { resolveBrowserDefaultBaseUrl } = await import('../src/services/apiClient.js')

    expect(resolveBrowserDefaultBaseUrl()).toBe('http://localhost:8000')
  })
})
