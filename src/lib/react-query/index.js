import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'

const areDeepEqual = (a, b) => {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch (error) {
    return false
  }
}

class QueryCache {
  constructor() {
    this.map = new Map()
  }

  static normalizeKey(queryKey) {
    if (Array.isArray(queryKey)) {
      return queryKey
    }
    if (queryKey === undefined) {
      return ['__default__']
    }
    return [queryKey]
  }

  static hashKey(normalizedKey) {
    return JSON.stringify(normalizedKey ?? [])
  }

  get(queryKey) {
    const normalized = QueryCache.normalizeKey(queryKey)
    return this.map.get(QueryCache.hashKey(normalized))
  }

  set(queryKey, value) {
    const normalized = QueryCache.normalizeKey(queryKey)
    this.map.set(QueryCache.hashKey(normalized), { ...value, key: normalized })
  }

  delete(queryKey) {
    const normalized = QueryCache.normalizeKey(queryKey)
    this.map.delete(QueryCache.hashKey(normalized))
  }

  clear() {
    this.map.clear()
  }

  keysMatching(partialKey) {
    if (!partialKey) {
      return Array.from(this.map.keys())
    }

    const normalizedPartial = QueryCache.normalizeKey(partialKey)
    return Array.from(this.map.entries())
      .filter(([, entry]) => QueryCache.isPrefix(entry.key, normalizedPartial))
      .map(([hash]) => hash)
  }

  deleteByHash(hash) {
    this.map.delete(hash)
  }

  getByHash(hash) {
    return this.map.get(hash)
  }

  static isPrefix(fullKey, partialKey) {
    if (partialKey.length > fullKey.length) {
      return false
    }
    for (let index = 0; index < partialKey.length; index += 1) {
      if (!areDeepEqual(fullKey[index], partialKey[index])) {
        return false
      }
    }
    return true
  }
}

export class QueryClient {
  constructor(options = {}) {
    this.defaultOptions = options.defaultOptions ?? { queries: {}, mutations: {} }
    this.cache = new QueryCache()
    this.listeners = new Set()
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {}
    }
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify() {
    this.listeners.forEach((listener) => {
      try {
        listener()
      } catch (error) {
        // noop
      }
    })
  }

  getQueryData(queryKey) {
    const entry = this.cache.get(queryKey)
    return entry ? entry.data : undefined
  }

  getQueryState(queryKey) {
    const entry = this.cache.get(queryKey)
    if (!entry) {
      return undefined
    }

    return {
      status: entry.status ?? 'idle',
      error: entry.error ?? null,
      dataUpdatedAt: entry.dataUpdatedAt ?? 0,
    }
  }

  setQueryData(queryKey, updater) {
    const previousEntry = this.cache.get(queryKey)
    const previousData = previousEntry ? previousEntry.data : undefined
    const nextData = typeof updater === 'function' ? updater(previousData) : updater
    const staleTime = previousEntry?.staleTime ?? this.defaultOptions?.queries?.staleTime ?? 0

    this.cache.set(queryKey, {
      key: QueryCache.normalizeKey(queryKey),
      data: nextData,
      status: 'success',
      error: null,
      dataUpdatedAt: Date.now(),
      staleTime,
    })
    this.notify()
    return nextData
  }

  async fetchQuery({ queryKey, queryFn, staleTime, force = false }) {
    if (typeof queryFn !== 'function') {
      throw new Error('fetchQuery requires a queryFn function')
    }

    const normalizedKey = QueryCache.normalizeKey(queryKey)
    const existing = this.cache.get(normalizedKey)
    const defaultStaleTime = this.defaultOptions?.queries?.staleTime ?? 0
    const effectiveStaleTime = typeof staleTime === 'number' ? staleTime : defaultStaleTime

    if (!force && existing && existing.status === 'success' && existing.data !== undefined) {
      const age = Date.now() - (existing.dataUpdatedAt ?? 0)
      if (effectiveStaleTime === Infinity || age <= effectiveStaleTime) {
        return existing.data
      }
    }

    this.cache.set(normalizedKey, {
      key: normalizedKey,
      data: existing?.data,
      status: 'loading',
      error: null,
      dataUpdatedAt: existing?.dataUpdatedAt ?? 0,
      staleTime: effectiveStaleTime,
    })
    this.notify()

    try {
      const data = await queryFn()
      this.cache.set(normalizedKey, {
        key: normalizedKey,
        data,
        status: 'success',
        error: null,
        dataUpdatedAt: Date.now(),
        staleTime: effectiveStaleTime,
      })
      this.notify()
      return data
    } catch (error) {
      this.cache.set(normalizedKey, {
        key: normalizedKey,
        data: existing?.data,
        status: 'error',
        error,
        dataUpdatedAt: existing?.dataUpdatedAt ?? 0,
        staleTime: effectiveStaleTime,
      })
      this.notify()
      throw error
    }
  }

  invalidateQueries({ queryKey } = {}) {
    const hashes = this.cache.keysMatching(queryKey)
    hashes.forEach((hash) => this.cache.deleteByHash(hash))
    if (hashes.length > 0) {
      this.notify()
    }
  }

  removeQueries(options = {}) {
    this.invalidateQueries(options)
  }

  clear() {
    this.cache.clear()
    this.notify()
  }
}

const QueryClientContext = createContext(null)

export const QueryClientProvider = ({ client, children }) => {
  if (!client) {
    throw new Error('QueryClientProvider requires a client instance')
  }

  return createElement(QueryClientContext.Provider, { value: client }, children)
}

export const useQueryClient = () => {
  const client = useContext(QueryClientContext)
  if (!client) {
    throw new Error('No QueryClient available. Wrap your app in QueryClientProvider.')
  }
  return client
}

const getKeyHash = (key) => JSON.stringify(QueryCache.normalizeKey(key))

export const useQuery = ({ queryKey, queryFn, enabled = true, staleTime } = {}) => {
  const client = useQueryClient()
  const [, forceRender] = useReducer((count) => count + 1, 0)
  const keyHash = useMemo(() => getKeyHash(queryKey), [queryKey])

  useEffect(() => {
    const unsubscribe = client.subscribe(() => {
      forceRender()
    })
    return unsubscribe
  }, [client])

  useEffect(() => {
    if (!enabled) {
      return
    }
    client.fetchQuery({ queryKey, queryFn, staleTime }).catch(() => {})
  }, [client, keyHash, enabled, queryFn, staleTime])

  const state = client.getQueryState(queryKey)
  const data = client.getQueryData(queryKey)
  const status = state?.status ?? (data !== undefined ? 'success' : 'idle')
  const error = state?.error ?? null

  const refetch = (options = {}) =>
    client.fetchQuery({
      queryKey,
      queryFn,
      staleTime,
      force: options.force ?? true,
    })

  return {
    data,
    error,
    status,
    isLoading: status === 'loading' && !data,
    isFetching: status === 'loading',
    refetch,
  }
}

export const useMutation = ({
  mutationFn,
  onSuccess,
  onError,
  onSettled,
} = {}) => {
  if (typeof mutationFn !== 'function') {
    throw new Error('useMutation requires a mutationFn function')
  }

  const [state, setState] = useState({ status: 'idle', data: null, error: null })

  const mutateAsync = async (variables) => {
    setState({ status: 'loading', data: null, error: null })

    try {
      const data = await mutationFn(variables)
      setState({ status: 'success', data, error: null })
      onSuccess?.(data, variables, null)
      onSettled?.(data, null, variables, null)
      return data
    } catch (error) {
      setState({ status: 'error', data: null, error })
      onError?.(error, variables, null)
      onSettled?.(null, error, variables, null)
      throw error
    }
  }

  const mutate = (variables, callbacks = {}) => {
    mutateAsync(variables)
      .then((data) => {
        callbacks.onSuccess?.(data, variables, null)
        callbacks.onSettled?.(data, null, variables, null)
      })
      .catch((error) => {
        callbacks.onError?.(error, variables, null)
        callbacks.onSettled?.(null, error, variables, null)
      })
  }

  const reset = () => setState({ status: 'idle', data: null, error: null })

  return {
    mutate,
    mutateAsync,
    reset,
    status: state.status,
    data: state.data,
    error: state.error,
    isPending: state.status === 'loading',
  }
}

export default QueryClient
