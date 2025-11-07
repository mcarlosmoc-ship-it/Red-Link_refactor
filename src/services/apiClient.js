const DEV_SERVER_PORTS = new Set(['5173', '4173'])

const resolveBrowserDefaultBaseUrl = () => {
  if (typeof globalThis === 'undefined') {
    return null
  }

  const { location } = globalThis
  if (!location?.origin) {
    return null
  }

  const hostname = location.hostname?.toLowerCase()
  const port = location.port ?? ''
  const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname)

  if (isLocalHost && DEV_SERVER_PORTS.has(port)) {
    // When running the SPA locally through Vite we want to keep the
    // historical behaviour of pointing the client to the FastAPI service
    // listening on port 8000. This mirrors the default value suggested in
    // the documentation and avoids accidental calls to the dev server.
    const backendHost = hostname === '0.0.0.0' ? '127.0.0.1' : hostname
    return `${location.protocol}//${backendHost}:8000`
  }

  return location.origin
}

const FALLBACK_BASE_URL = resolveBrowserDefaultBaseUrl() ?? 'http://localhost:8000'

export const ACCESS_TOKEN_STORAGE_KEY = 'red-link.backoffice.accessToken'
const LEGACY_ACCESS_TOKEN_STORAGE_KEYS = ['red-link.accessToken']

const readAccessTokenFromEnv = () => {
  const rawFromVite =
    typeof import.meta !== 'undefined' && typeof import.meta.env?.VITE_API_ACCESS_TOKEN === 'string'
      ? import.meta.env.VITE_API_ACCESS_TOKEN
      : null

  const rawFromProcess =
    typeof globalThis !== 'undefined' && typeof globalThis?.process?.env?.VITE_API_ACCESS_TOKEN === 'string'
      ? globalThis.process.env.VITE_API_ACCESS_TOKEN
      : null

  const raw = rawFromVite ?? rawFromProcess
  if (!raw) {
    return null
  }
  const trimmed = raw.trim()
  return trimmed ? trimmed : null
}

const detectAccessibleStorages = () => {
  if (typeof globalThis === 'undefined') {
    return []
  }

  return STORAGE_CANDIDATES.flatMap((candidate) => {
    try {
      const storage = globalThis?.[candidate]
      if (!storage) {
        return []
      }
      storage.setItem(STORAGE_TEST_KEY, '1')
      storage.removeItem(STORAGE_TEST_KEY)
      return [{ name: candidate, storage }]
    } catch (error) {
      return []
    }
  })
}

const storageEntries = detectAccessibleStorages()
const persistentStorage = storageEntries[0]?.storage ?? null

const tryReadStorageValue = (key) => {
  if (!persistentStorage) {
    return null
  }
  try {
    const raw = persistentStorage.getItem(key)
    if (!raw) {
      return null
    }
    const trimmed = raw.trim()
    return trimmed ? trimmed : null
  } catch (error) {
    return null
  }
}

const removeLegacyTokens = () => {
  if (!persistentStorage) {
    return
  }
  LEGACY_ACCESS_TOKEN_STORAGE_KEYS.forEach((key) => {
    if (key === ACCESS_TOKEN_STORAGE_KEY) {
      return
    }
    try {
      persistentStorage.removeItem(key)
    } catch (error) {
      // ignore legacy cleanup errors
    }
  })
}

const readStoredAccessToken = () => {
  const currentValue = tryReadStorageValue(ACCESS_TOKEN_STORAGE_KEY)
  if (currentValue) {
    removeLegacyTokens()
    return currentValue
  }

  for (const legacyKey of LEGACY_ACCESS_TOKEN_STORAGE_KEYS) {
    if (legacyKey === ACCESS_TOKEN_STORAGE_KEY) {
      continue
    }
    const legacyValue = tryReadStorageValue(legacyKey)
    if (legacyValue) {
      if (persistentStorage) {
        try {
          persistentStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, legacyValue)
        } catch (error) {
          // ignore persistence issues when migrating
        }
      }
      removeLegacyTokens()
      return legacyValue
    }
  }

  return null
}

const persistAccessToken = (token) => {
  if (!persistentStorage) {
    return
  }
  try {
    if (!token) {
      persistentStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
      removeLegacyTokens()
    } else {
      persistentStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
      removeLegacyTokens()
    }
  } catch (error) {
    // ignore legacy cleanup errors
  }
}

const removeLegacyTokens = () => {
  if (!storageEntries.length) {
    return
  }
  const keysToRemove = LEGACY_ACCESS_TOKEN_STORAGE_KEYS.filter(
    (key) => key && key !== ACCESS_TOKEN_STORAGE_KEY,
  )
  if (keysToRemove.length === 0) {
    return
  }
  storageEntries.forEach(({ storage }) => {
    keysToRemove.forEach((key) => {
      tryRemoveStorageKey(storage, key)
    })
  })
}

const removeDuplicateTokens = () => {
  if (!persistentStorage) {
    return
  }
  storageEntries.forEach(({ storage }) => {
    if (storage === persistentStorage) {
      return
    }
    tryRemoveStorageKey(storage, ACCESS_TOKEN_STORAGE_KEY)
  })
}

const cleanTokenStorage = () => {
  removeLegacyTokens()
  removeDuplicateTokens()
}

const readStoredAccessToken = () => {
  const currentValue = tryReadStorageValue(persistentStorage, ACCESS_TOKEN_STORAGE_KEY)
  if (currentValue) {
    cleanTokenStorage()
    return currentValue
  }

  const migrationKeys = [ACCESS_TOKEN_STORAGE_KEY, ...LEGACY_ACCESS_TOKEN_STORAGE_KEYS]

  for (const { storage } of storageEntries) {
    for (const key of migrationKeys) {
      if (storage === persistentStorage && key === ACCESS_TOKEN_STORAGE_KEY) {
        continue
      }
      const value = tryReadStorageValue(storage, key)
      if (value) {
        const persisted =
          persistentStorage &&
          trySetStorageValue(persistentStorage, ACCESS_TOKEN_STORAGE_KEY, value)
        if (persisted && (storage !== persistentStorage || key !== ACCESS_TOKEN_STORAGE_KEY)) {
          tryRemoveStorageKey(storage, key)
        }
        if (persisted) {
          cleanTokenStorage()
        }
        return value
      }
    }
  }

  return null
}

const persistAccessToken = (token) => {
  if (!persistentStorage) {
    return
  }

  if (!token) {
    tryRemoveStorageKey(persistentStorage, ACCESS_TOKEN_STORAGE_KEY)
    cleanTokenStorage()
    return
  }

  const persisted = trySetStorageValue(persistentStorage, ACCESS_TOKEN_STORAGE_KEY, token)
  if (persisted) {
    cleanTokenStorage()
  }
}

let accessToken = null
let didLoadInitialToken = false

const normalizeToken = (token) => {
  if (typeof token === 'string') {
    const trimmed = token.trim()
    return trimmed ? trimmed : null
  }
  if (token === null || token === undefined) {
    return null
  }
  return normalizeToken(String(token))
}

const loadInitialAccessToken = () => {
  if (didLoadInitialToken) {
    return accessToken
  }
  const stored = readStoredAccessToken()
  const fromEnv = readAccessTokenFromEnv()
  accessToken = stored ?? fromEnv ?? null
  didLoadInitialToken = true
  return accessToken
}

const getAccessToken = () => {
  return accessToken ?? loadInitialAccessToken()
}

const setAccessToken = (token, { persist = true } = {}) => {
  const normalized = normalizeToken(token)
  accessToken = normalized
  didLoadInitialToken = true
  if (persist) {
    persistAccessToken(accessToken)
  }
  return accessToken
}

const clearAccessToken = ({ persist = true } = {}) => {
  return setAccessToken(null, { persist })
}

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
    return FALLBACK_BASE_URL
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return FALLBACK_BASE_URL
  }
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '')
  if (/^https?:\/\//i.test(withoutTrailingSlash)) {
    return withoutTrailingSlash
  }
  if (typeof console !== 'undefined') {
    console.warn('[apiClient] Invalid VITE_API_BASE_URL provided, falling back to default:', raw)
  }
  return FALLBACK_BASE_URL
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

  const [base, hashFragment] = url.split('#', 2)
  const needsQuestionMark = !base.includes('?')
  const hasTerminalSeparator = /[?&]$/.test(base)
  const separator = needsQuestionMark ? '?' : hasTerminalSeparator ? '' : '&'
  const combined = `${base}${separator}${searchString}`

  return hashFragment !== undefined ? `${combined}#${hashFragment}` : combined
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
  const token = getAccessToken()
  if (token) {
    ensureHeader('Authorization', `Bearer ${token}`)
  }
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

const flattenErrorParts = (value, fallback = '') => {
  if (value === null || value === undefined) {
    return []
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)]
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenErrorParts(item, fallback))
  }

  if (typeof value === 'object') {
    if (value.message || value.detail) {
      return flattenErrorParts(value.message ?? value.detail, fallback)
    }
    return Object.values(value).flatMap((item) => flattenErrorParts(item, fallback))
  }

  try {
    return [JSON.stringify(value)]
  } catch (error) {
    return fallback ? [fallback] : []
  }
}

const resolveErrorMessage = (data, response) => {
  const fallback = response?.statusText || 'Request failed'
  const parts = flattenErrorParts(
    data?.message ?? data?.detail ?? data?.error ?? data ?? fallback,
    fallback,
  )
  if (parts.length === 0) {
    return fallback
  }
  return parts.join('\n')
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
    const errorMessage = resolveErrorMessage(data, response)
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
  getAccessToken,
  setAccessToken,
  clearAccessToken,
}

if (typeof globalThis !== 'undefined') {
  const globalClient = globalThis.__RED_LINK_API_CLIENT__ ?? {}
  globalThis.__RED_LINK_API_CLIENT__ = {
    ...globalClient,
    getAccessToken,
    setAccessToken,
    clearAccessToken,
    storageKey: ACCESS_TOKEN_STORAGE_KEY,
  }
}

export const buildApiUrl = (path, query) => buildUrl(path, query)
