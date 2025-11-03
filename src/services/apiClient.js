const DEFAULT_BASE_URL = 'http://localhost:8000'

const readBaseUrlFromEnv = () => {
  if (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }
  if (typeof globalThis !== 'undefined' && globalThis?.process?.env?.VITE_API_BASE_URL) {
    return globalThis.process.env.VITE_API_BASE_URL
  }
  return null
}

const sanitizeBaseUrl = (raw) => {
  if (!raw || typeof raw !== 'string') {
    return DEFAULT_BASE_URL
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return DEFAULT_BASE_URL
  }
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '')
  if (/^https?:\/\//i.test(withoutTrailingSlash)) {
    return withoutTrailingSlash
  }
  if (typeof console !== 'undefined') {
    console.warn('[apiClient] Invalid VITE_API_BASE_URL provided, falling back to default:', raw)
  }
  return DEFAULT_BASE_URL
}

const BASE_URL = sanitizeBaseUrl(readBaseUrlFromEnv())

export class ApiError extends Error {
  constructor(message, { status, data, headers } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status ?? null
    this.data = data ?? null
    this.headers = headers ?? null
  }
}

const isJsonBody = (body) => {
  const FormDataConstructor = typeof globalThis !== 'undefined' ? globalThis.FormData : undefined
  if (FormDataConstructor && body instanceof FormDataConstructor) {
    return false
  }
  return body !== undefined && body !== null
}

const parseBody = (body) => {
  if (!isJsonBody(body)) {
    return body
  }
  return JSON.stringify(body)
}

const applySearchParams = (url, searchParams) => {
  if (!searchParams) {
    return url
  }
  const SearchParamsConstructor = typeof globalThis !== 'undefined' ? globalThis.URLSearchParams : undefined
  const params = SearchParamsConstructor ? new SearchParamsConstructor() : new Map()
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null) {
          if (params instanceof Map) {
            const existing = params.get(key) ?? []
            params.set(key, [...existing, String(item)])
          } else {
            params.append(key, String(item))
          }
        }
      })
      return
    }
    if (params instanceof Map) {
      params.set(key, String(value))
    } else {
      params.set(key, String(value))
    }
  })
  let searchString = ''
  if (params instanceof Map) {
    const searchParams = []
    params.forEach((value, key) => {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item !== '') {
            searchParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`)
          }
        })
      } else if (value !== '') {
        searchParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      }
    })
    searchString = searchParams.join('&')
  } else {
    params.forEach((value, key) => {
      if (value === '') {
        params.delete(key)
      }
    })
    searchString = params.toString()
  }
  if (!searchString) {
    return url
  }
  return `${url}?${searchString}`
}

const buildUrl = (path, searchParams) => {
  const normalizedPath = path?.startsWith('/') ? path : `/${path ?? ''}`
  const url = `${BASE_URL}${normalizedPath}`
  return applySearchParams(url, searchParams)
}

const resolveHeaders = (body, customHeaders = {}) => {
  const headers = { ...customHeaders }
  const ensureHeader = (name, value) => {
    const hasHeader = Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase())
    if (!hasHeader) {
      headers[name] = value
    }
  }
  if (isJsonBody(body)) {
    ensureHeader('Content-Type', 'application/json')
  }
  ensureHeader('Accept', 'application/json')
  return headers
}

const extractResponseData = async (response) => {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }
  if (contentType.includes('text/')) {
    return response.text()
  }
  return null
}

const request = async (method, path, { body, headers, query, signal, ...restOptions } = {}) => {
  const fetchFn = typeof globalThis !== 'undefined' && globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined
  if (!fetchFn) {
    throw new Error('Global fetch implementation is required to use apiClient')
  }
  const resolvedHeaders = resolveHeaders(body, headers)
  const response = await fetchFn(buildUrl(path, query), {
    method,
    body: parseBody(body),
    headers: resolvedHeaders,
    signal,
    ...restOptions,
  })

  const data = await extractResponseData(response)

  if (!response.ok) {
    const errorMessage = data?.message || data?.detail || response.statusText || 'Request failed'
    throw new ApiError(errorMessage, {
      status: response.status,
      data,
      headers: response.headers,
    })
  }

  return {
    data,
    status: response.status,
    headers: response.headers,
  }
}

export const apiClient = {
  get: (path, options) => request('GET', path, options),
  post: (path, body, options = {}) => request('POST', path, { ...options, body }),
  put: (path, body, options = {}) => request('PUT', path, { ...options, body }),
  patch: (path, body, options = {}) => request('PATCH', path, { ...options, body }),
  delete: (path, options) => request('DELETE', path, options),
  getBaseUrl: () => BASE_URL,
}

export const buildApiUrl = (path, query) => buildUrl(path, query)
