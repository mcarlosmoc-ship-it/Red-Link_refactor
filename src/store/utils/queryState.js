import { queryClient } from '../../services/queryClient.js'
import { RESOURCE_TTL_MS } from '../constants.js'

const normalizeQueryKey = (queryKey) => (Array.isArray(queryKey) ? queryKey : [queryKey])

export const getCachedQueryData = (queryKey, { ttl = RESOURCE_TTL_MS } = {}) => {
  const normalizedKey = normalizeQueryKey(queryKey)
  const cached = queryClient.getQueryData(normalizedKey)
  const state = queryClient.getQueryState(normalizedKey)

  if (!cached || !state?.dataUpdatedAt) {
    return null
  }

  if (ttl === Infinity) {
    return cached
  }

  const age = Date.now() - state.dataUpdatedAt
  return age <= ttl ? cached : null
}

export const invalidateQuery = (queryKey) => {
  const normalizedKey = normalizeQueryKey(queryKey)
  queryClient.invalidateQueries({ queryKey: normalizedKey })
}

export const refetchQuery = async (queryKey, { queryFn, staleTime } = {}) => {
  const normalizedKey = normalizeQueryKey(queryKey)
  return queryClient.fetchQuery({
    queryKey: normalizedKey,
    queryFn,
    staleTime,
  })
}

export const ensureQueryData = async (queryKey, { queryFn, ttl = RESOURCE_TTL_MS } = {}) => {
  const cached = getCachedQueryData(queryKey, { ttl })
  if (cached) {
    return cached
  }

  return refetchQuery(queryKey, { queryFn, staleTime: ttl })
}

export default {
  ensureQueryData,
  getCachedQueryData,
  invalidateQuery,
  refetchQuery,
}
