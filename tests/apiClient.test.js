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

  it('supports building query strings from Map instances', () => {
    const filters = new Map([
      ['page', 5],
      ['status', ['active', 'vip']],
      ['sort', 'name'],
      ['tags', ['priority', 'new']]
    ])

    const url = buildApiUrl('/clients', Object.fromEntries(filters))

    expect(url).toBe(
      'http://localhost:8000/clients?page=5&status=active&status=vip&sort=name&tags=priority&tags=new'
    )
  })

  it('keeps absolute URLs unchanged while appending query parameters', () => {
    const url = buildApiUrl('https://example.com/resource', { q: '1' })

    expect(url).toBe('https://example.com/resource?q=1')
  })
})
