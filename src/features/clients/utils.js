export const normalizeId = (value) => {
  if (value === null || value === undefined) {
    return null
  }
  return String(value)
}

export const resolveApiErrorMessage = (error, fallback = 'Intenta nuevamente.') => {
  if (!error || typeof error !== 'object') {
    return fallback
  }

  const detail =
    error?.response?.data?.detail ??
    error?.data?.detail ??
    error?.detail ??
    error?.response?.data?.message ??
    error?.data?.message

  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim()
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }
        if (item && typeof item === 'object') {
          if (typeof item.msg === 'string' && item.msg.trim()) {
            return item.msg.trim()
          }
          if (typeof item.message === 'string' && item.message.trim()) {
            return item.message.trim()
          }
        }
        return null
      })
      .filter(Boolean)

    if (messages.length > 0) {
      return messages.join(', ')
    }
  }

  if (detail && typeof detail === 'object') {
    if (typeof detail.msg === 'string' && detail.msg.trim()) {
      return detail.msg.trim()
    }
    if (typeof detail.message === 'string' && detail.message.trim()) {
      return detail.message.trim()
    }
  }

  const fallbackMessage = typeof error.message === 'string' ? error.message.trim() : ''
  return fallbackMessage || fallback
}

export const createInitialServiceState = (zoneId) => ({
  servicePlanId: '',
  displayName: '',
  serviceType: 'internet',
  price: '',
  billingDay: '1',
  baseId: zoneId ? String(zoneId) : '',
  useClientBase: Boolean(zoneId),
  status: 'active',
  notes: '',
  ipAddress: '',
  antennaIp: '',
  modemIp: '',
  antennaModel: '',
  modemModel: '',
  debtAmount: '',
  debtMonths: '',
  debtNotes: '',
})

export const getPrimaryService = (client) => {
  const services = Array.isArray(client?.services) ? client.services : []
  if (services.length === 0) {
    return null
  }
  return services[0]
}
