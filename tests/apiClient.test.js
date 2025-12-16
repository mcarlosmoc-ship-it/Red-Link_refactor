import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalLocation = globalThis.location
const originalDevBackendPort = process.env.VITE_DEV_BACKEND_PORT

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

  if (originalDevBackendPort === undefined) {
    delete process.env.VITE_DEV_BACKEND_PORT
  } else {
    process.env.VITE_DEV_BACKEND_PORT = originalDevBackendPort
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

  it('forces the backend port when running from a Vite preview port', async () => {
    setMockLocation({ hostname: 'localhost', port: '4174' })
    const { resolveBrowserDefaultBaseUrl } = await import('../src/services/apiClient.js')

    expect(resolveBrowserDefaultBaseUrl()).toBe('http://localhost:8000')
  })

  it('respects VITE_DEV_BACKEND_PORT when forcing the backend host', async () => {
    setMockLocation({ hostname: 'localhost', port: '3000' })
    process.env.VITE_DEV_BACKEND_PORT = '9000'
    const { resolveBrowserDefaultBaseUrl } = await import('../src/services/apiClient.js')

    expect(resolveBrowserDefaultBaseUrl()).toBe('http://localhost:9000')
  })
})
