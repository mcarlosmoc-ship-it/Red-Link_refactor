import wait from './wait.js'

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
    const message = error?.message ?? 'Ocurrió un error inesperado.'
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
    const message = error?.message ?? 'Ocurrió un error inesperado.'
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
