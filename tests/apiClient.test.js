import { describe, expect, it } from 'vitest'
import { buildApiUrl } from '../src/services/apiClient.js'

describe('buildApiUrl', () => {
  it('appends query parameters to paths without existing search', () => {
    const url = buildApiUrl('/clients', { page: 2, status: 'active' })
    expect(url).toBe('http://localhost:8000/clients?page=2&status=active')
  })

  it('appends query parameters to paths with existing search strings', () => {
    const url = buildApiUrl('/clients?status=active', { page: 3 })
    expect(url).toBe('http://localhost:8000/clients?status=active&page=3')
  })

  it('preserves trailing separators and hash fragments when appending parameters', () => {
    const urlWithTrailing = buildApiUrl('/clients?status=active&', { page: 1 })
    expect(urlWithTrailing).toBe('http://localhost:8000/clients?status=active&page=1')

    const urlWithHash = buildApiUrl('/clients?status=active#section', { page: 4 })
    expect(urlWithHash).toBe('http://localhost:8000/clients?status=active&page=4#section')
  })

  it('omits nullish query parameter values', () => {
    const url = buildApiUrl('/clients', {
      page: 1,
      status: null,
      sort: undefined,
      search: 'john'
    })

    expect(url).toBe('http://localhost:8000/clients?page=1&search=john')
  })

  it('expands array values into repeated parameters', () => {
    const url = buildApiUrl('/clients', {
      status: ['active', 'vip'],
      sort: 'name'
    })

    expect(url).toBe('http://localhost:8000/clients?status=active&status=vip&sort=name')
  })
})
