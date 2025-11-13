const DEFAULT_DEV_BACKEND_PORT = '8000'

const readDevBackendPort = () => {
  const rawFromVite =
    typeof import.meta !== 'undefined' && typeof import.meta.env?.VITE_DEV_BACKEND_PORT === 'string'
      ? import.meta.env.VITE_DEV_BACKEND_PORT
      : null

  const rawFromProcess =
    typeof globalThis !== 'undefined' && typeof globalThis?.process?.env?.VITE_DEV_BACKEND_PORT === 'string'
      ? globalThis.process.env.VITE_DEV_BACKEND_PORT
      : null

  const raw = rawFromVite ?? rawFromProcess
  if (!raw) {
    return DEFAULT_DEV_BACKEND_PORT
  }

  const trimmed = raw.trim()
  return trimmed || DEFAULT_DEV_BACKEND_PORT
}

const DEV_SERVER_PORTS = new Set(['5173', '4173'])

const isRunningOnDevServer = ({ isLocalHost, port }) => {
  if (!isLocalHost) {
    return false
  }

  if (typeof import.meta !== 'undefined' && import.meta?.env?.DEV) {
    return true
  }

  return DEV_SERVER_PORTS.has(port ?? '')
}

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

  if (isRunningOnDevServer({ isLocalHost, port })) {
    // When running the SPA locally through Vite we want to keep the
    // historical behaviour of pointing the client to the FastAPI service
    // listening on port 8000. This mirrors the default value suggested in
    // the documentation and avoids accidental calls to the dev server.
    const backendHost = hostname === '0.0.0.0' ? '127.0.0.1' : hostname
    const backendPort = readDevBackendPort()
    return `${location.protocol}//${backendHost}:${backendPort}`
  }

  return location.origin
}

const FALLBACK_BASE_URL = resolveBrowserDefaultBaseUrl() ?? 'http://localhost:8000'

export const ACCESS_TOKEN_STORAGE_KEY = 'red-link.backoffice.accessToken'
const LEGACY_ACCESS_TOKEN_STORAGE_KEYS = ['red-link.accessToken']

const STORAGE_CANDIDATES = ['localStorage', 'sessionStorage']
const STORAGE_TEST_KEY = '__red-link.storage.test__'

export const ACCESS_TOKEN_EVENT = 'red-link:access-token-changed'

const accessTokenListeners = new Set()

const notifyAccessTokenChange = (token) => {
  accessTokenListeners.forEach((listener) => {
    try {
      listener(token ?? null)
    } catch (error) {
      // Ignore listener failures so they do not interrupt other subscribers
    }
  })

  if (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.dispatchEvent === 'function' &&
    typeof globalThis.CustomEvent === 'function'
  ) {
    try {
      const event = new globalThis.CustomEvent(ACCESS_TOKEN_EVENT, {
        detail: { token: token ?? null },
      })
      globalThis.dispatchEvent(event)
    } catch (error) {
      // Ignore failures when CustomEvent initialization is not supported
    }
  }
}

export const subscribeToAccessToken = (listener) => {
  if (typeof listener !== 'function') {
    return () => {}
  }
  accessTokenListeners.add(listener)
  return () => {
    accessTokenListeners.delete(listener)
  }
}

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

const tryReadStorageValue = (storage, key) => {
  if (!storage) {
    return null
  }

  try {
    const raw = storage.getItem(key)
    if (!raw) {
      return null
    }
    const trimmed = raw.trim()
    return trimmed ? trimmed : null
  } catch (error) {
    return null
  }
}

const trySetStorageValue = (storage, key, value) => {
  if (!storage) {
    return false
  }

  try {
    storage.setItem(key, value)
    return true
  } catch (error) {
    return false
  }
}

const tryRemoveStorageKey = (storage, key) => {
  if (!storage) {
    return false
  }

  try {
    storage.removeItem(key)
    return true
  } catch (error) {
    return false
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
  const previousToken = didLoadInitialToken ? accessToken : loadInitialAccessToken()
  const normalized = normalizeToken(token)
  accessToken = normalized
  didLoadInitialToken = true
  if (persist) {
    persistAccessToken(accessToken)
  }
  if (previousToken !== accessToken) {
    notifyAccessTokenChange(accessToken)
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

const resolveHeaders = (body, customHeaders = {}, { auth = true } = {}) => {
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
  if (auth) {
    const token = getAccessToken()
    if (token) {
      ensureHeader('Authorization', `Bearer ${token}`)
    }
  }
  return headers
}

const extractResponseData = async (response) => {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const rawBody = await response.text()
    if (!rawBody) {
      return null
    }
    const trimmed = rawBody.trim()
    if (!trimmed) {
      return null
    }
    try {
      return JSON.parse(trimmed)
    } catch (error) {
      throw new ApiError('La respuesta de la API no es un JSON válido.', {
        status: response.status,
        data: trimmed,
        headers: response.headers,
      })
    }
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

const isNetworkError = (error) => {
  if (!error) {
    return false
  }

  const message = typeof error.message === 'string' ? error.message.toLowerCase() : ''
  if (!message) {
    return false
  }

  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror when attempting to fetch resource') ||
    message.includes('load failed') ||
    message.includes('network request failed')
  )
}

const logError = (message, payload, error) => {
  if (typeof console === 'undefined') {
    return
  }
  const logger =
    (typeof console.error === 'function' && console.error.bind(console)) ||
    (typeof console.log === 'function' && console.log.bind(console))
  if (typeof logger !== 'function') {
    return
  }
  if (error) {
    logger(message, payload, error)
  } else {
    logger(message, payload)
  }
}

const request = async (method, path, { body, headers, query, signal, auth = true, ...restOptions } = {}) => {
  const fetchFn = typeof globalThis !== 'undefined' && globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined
  if (!fetchFn) {
    throw new Error('Global fetch implementation is required to use apiClient')
  }
  const resolvedHeaders = resolveHeaders(body, headers, { auth })
  const url = buildUrl(path, query)
  let response
  try {
    response = await fetchFn(url, {
      method,
      body: parseBody(body),
      headers: resolvedHeaders,
      signal,
      ...restOptions,
    })
  } catch (error) {
    if (isNetworkError(error)) {
      logError('[apiClient] Network error while calling API', { method, path, url, error: error?.message ?? error }, error)
      const details = error?.message ? ` Detalles: ${error.message}` : ''
      const apiError = new ApiError(
        `No se pudo conectar con la API. Verifica que el backend esté en ejecución y que la URL configurada sea correcta.${details} ` +
          'Si el frontend se ejecuta en un origen diferente, asegúrate de agregarlo a BACKEND_ALLOWED_ORIGINS o habilitar el puerto en FastAPI.',
      )
      if (apiError && error && typeof error === 'object') {
        apiError.cause = error
      }
      throw apiError
    }
    logError('[apiClient] Unexpected error while preparing request', { method, path, url }, error)
    throw error
  }

  const data = await extractResponseData(response)

  if (!response.ok) {
    const errorMessage = resolveErrorMessage(data, response)
    logError('[apiClient] API responded with an error', { method, path, url, status: response.status, data })
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
  subscribeToAccessToken,
}

if (typeof globalThis !== 'undefined') {
  const globalClient = globalThis.__RED_LINK_API_CLIENT__ ?? {}
  globalThis.__RED_LINK_API_CLIENT__ = {
    ...globalClient,
    getAccessToken,
    setAccessToken,
    clearAccessToken,
    storageKey: ACCESS_TOKEN_STORAGE_KEY,
    subscribe: subscribeToAccessToken,
    accessTokenEvent: ACCESS_TOKEN_EVENT,
  }
}

export const buildApiUrl = (path, query) => buildUrl(path, query)
