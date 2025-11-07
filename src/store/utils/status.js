import wait from './wait.js'

const resolveStatusCode = (error) => {
  if (!error || typeof error !== 'object') {
    return null
  }

  const { status, statusCode, status_code: statusCodeSnake, response, data } = error
  if (typeof status === 'number') {
    return status
  }
  if (typeof statusCode === 'number') {
    return statusCode
  }
  if (typeof statusCodeSnake === 'number') {
    return statusCodeSnake
  }
  if (typeof response?.status === 'number') {
    return response.status
  }
  if (typeof data?.status === 'number') {
    return data.status
  }
  return null
}

const resolveErrorMessage = (error, fallback = 'Ocurrió un error inesperado.') => {
  const defaultMessage = error?.message ?? fallback
  const statusCode = resolveStatusCode(error)

  if (statusCode === 401) {
    return (
      'La API rechazó la solicitud (401). Configura un token válido en VITE_API_ACCESS_TOKEN ' +
      'o ejecuta window.__RED_LINK_API_CLIENT__.setAccessToken("tu-token") desde la consola.'
    )
  }

  return defaultMessage
}

export const createResourceStatus = () => ({
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetchedAt: null,
  retries: 0,
})

export const createInitialStatus = () => ({
  clients: createResourceStatus(),
  principalAccounts: createResourceStatus(),
  clientAccounts: createResourceStatus(),
  payments: createResourceStatus(),
  resellers: createResourceStatus(),
  expenses: createResourceStatus(),
  inventory: createResourceStatus(),
  metrics: createResourceStatus(),
  initialize: createResourceStatus(),
})

export const setStatus = (set, resource, updates) => {
  set((state) => ({
    status: {
      ...state.status,
      [resource]: {
        ...state.status[resource],
        ...updates,
      },
    },
  }))
}

export const runWithStatus = async ({
  set,
  get,
  resource,
  action,
  retries = 0,
  updateTimestamp = true,
}) => {
  setStatus(set, resource, { isLoading: true, error: null })

  try {
    const result = await action()
    setStatus(set, resource, {
      isLoading: false,
      error: null,
      retries: 0,
      ...(updateTimestamp ? { lastFetchedAt: Date.now() } : {}),
    })
    return result
  } catch (error) {
    const message = resolveErrorMessage(error)
    const currentRetries = (get().status?.[resource]?.retries ?? 0) + 1
    setStatus(set, resource, {
      isLoading: false,
      error: message,
      retries: currentRetries,
    })

    if (retries > 0) {
      await wait(Math.min(500 * currentRetries, 2000))
      return runWithStatus({
        set,
        get,
        resource,
        action,
        retries: retries - 1,
        updateTimestamp,
      })
    }

    throw error
  }
}

export const runMutation = async ({ set, resources, action }) => {
  const targetResources = Array.isArray(resources) ? resources : [resources]
  targetResources.forEach((resource) =>
    setStatus(set, resource, { isMutating: true, error: null }),
  )

  try {
    const result = await action()
    targetResources.forEach((resource) => setStatus(set, resource, { isMutating: false }))
    return result
  } catch (error) {
    const message = resolveErrorMessage(error)
    targetResources.forEach((resource) =>
      setStatus(set, resource, { isMutating: false, error: message }),
    )
    throw error
  }
}

export default {
  createInitialStatus,
  createResourceStatus,
  runMutation,
  runWithStatus,
  setStatus,
}
