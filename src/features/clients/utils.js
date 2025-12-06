import { addMonthsToPeriod } from '../../utils/formatters.js'

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

export const CLIENT_TYPE_LABELS = {
  residential: 'Cliente residencial',
  token: 'Punto con antena pública',
}

export const SERVICE_STATUS_LABELS = {
  active: 'Activo',
  suspended: 'Suspendido',
  cancelled: 'Baja',
}

export const formatServiceStatus = (status) => SERVICE_STATUS_LABELS[status] ?? 'Desconocido'

export const isInternetLikeService = (serviceType) =>
  serviceType === 'internet' || serviceType === 'hotspot'

export const getPrimaryService = (client) => {
  const services = Array.isArray(client?.services) ? client.services : []
  if (services.length === 0) {
    return null
  }

  return services.find((service) => isInternetLikeService(service.type)) ?? services[0]
}

export const getClientMonthlyFee = (client, fallbackPrice = 0) => {
  const primaryService = getPrimaryService(client)
  const servicePrice = Number(primaryService?.price)
  if (Number.isFinite(servicePrice) && servicePrice > 0) {
    return servicePrice
  }

  const mappedFee = Number(client?.monthlyFee)
  if (Number.isFinite(mappedFee) && mappedFee > 0) {
    return mappedFee
  }

  return fallbackPrice
}

export const getOutstandingPeriodKeys = (anchorPeriod, debtMonths) => {
  const normalizedAnchor = typeof anchorPeriod === 'string' ? anchorPeriod : null
  const numericDebt = Number(debtMonths ?? 0)

  if (!normalizedAnchor || !Number.isFinite(numericDebt) || numericDebt <= 0.0001) {
    return []
  }

  const completeMonths = Math.max(Math.floor(numericDebt), 0)
  const keys = []

  for (let index = 0; index < completeMonths; index += 1) {
    keys.push(addMonthsToPeriod(normalizedAnchor, -index))
  }

  return keys
}

export const getFractionalDebt = (debtMonths) => {
  const numericDebt = Number(debtMonths ?? 0)

  if (!Number.isFinite(numericDebt)) {
    return 0
  }

  const fractional = Math.abs(numericDebt - Math.floor(numericDebt))
  return fractional > 0.0001 ? fractional : 0
}

export const getClientDebtSummary = (client, fallbackPrice = 0) => {
  const debtMonthsValue = Number(client?.debtMonths ?? 0)
  const debtMonths = Number.isFinite(debtMonthsValue) ? Math.max(0, debtMonthsValue) : 0
  const monthlyFee = getClientMonthlyFee(client, fallbackPrice)
  const totalDue = debtMonths * monthlyFee
  const fractionalDebt = getFractionalDebt(debtMonths)

  return {
    debtMonths,
    monthlyFee,
    totalDue,
    fractionalDebt,
  }
}
