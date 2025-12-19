import {
  addMonthsToPeriod,
  diffPeriods,
  getCurrentPeriodKey,
  parsePeriodKey,
} from '../../utils/formatters.js'
import { CLIENT_PRICE } from '../../store/constants.js'

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
  ipReservationId: '',
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
  pending_installation: 'Por instalar',
  installation_pending: 'Por instalar',
  billing_blocked: 'Bloqueo de facturación',
  blocked: 'Bloqueado',
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

export const getOutstandingPeriodKeys = (anchorPeriod, debtMonths) => {
  const normalizedAnchor = typeof anchorPeriod === 'string' ? anchorPeriod : null
  const numericDebt = Number(debtMonths ?? 0)

  if (
    !normalizedAnchor ||
    !parsePeriodKey(normalizedAnchor) ||
    !Number.isFinite(numericDebt) ||
    numericDebt <= 0.0001
  ) {
    return []
  }

  const completeMonths = Math.max(Math.floor(numericDebt), 0)
  const keys = []

  for (let index = 0; index < completeMonths; index += 1) {
    const nextKey = addMonthsToPeriod(normalizedAnchor, -index)

    if (nextKey) {
      keys.push(nextKey)
    }
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

export const getClientMonthlyFee = (client, fallback = CLIENT_PRICE) => {
  if (!client) return fallback

  const primaryService = getPrimaryService(client)
  const rawMonthlyFee =
    primaryService?.effectivePrice ??
    primaryService?.price ??
    primaryService?.customPrice ??
    client?.monthlyFee

  const numericMonthlyFee = Number(rawMonthlyFee)
  return Number.isFinite(numericMonthlyFee) ? numericMonthlyFee : fallback
}

export const getClientCoverageContext = (client, { periodKey } = {}) => {
  const effectivePeriod = periodKey ?? getCurrentPeriodKey()
  const primaryService = getPrimaryService(client)

  if (!primaryService) {
    return {
      coverageEnd: null,
      partialPeriod: null,
      aheadMonths: 0,
      debtMonths: 0,
      hasPartial: false,
      partialAmount: 0,
      isCovered: false,
    }
  }

  const coverageEnd =
    primaryService.coverageEndPeriod ?? primaryService.vigente_hasta_periodo ?? null
  const partialPeriod =
    primaryService.partialCoveragePeriod ?? primaryService.abono_periodo ?? null
  const partialAmount = Number(
    primaryService.partialCoverageAmount ?? primaryService.abono_monto ?? 0,
  )

  const coverageDelta = Number(diffPeriods(effectivePeriod, coverageEnd))
  const aheadMonths = Number.isFinite(coverageDelta) && coverageDelta > 0 ? coverageDelta : 0
  const debtMonths = Number.isFinite(coverageDelta) && coverageDelta < 0 ? Math.abs(coverageDelta) : 0
  const isCovered = Number.isFinite(coverageDelta) ? coverageDelta >= 0 : false

  const partialDelta = Number(diffPeriods(effectivePeriod, partialPeriod))
  const hasPartial =
    Number.isFinite(partialDelta) && partialDelta >= 0 && Number.isFinite(partialAmount) && partialAmount > 0

  return {
    coverageEnd,
    partialPeriod: hasPartial ? partialPeriod : null,
    aheadMonths,
    debtMonths,
    hasPartial,
    partialAmount: hasPartial ? partialAmount : 0,
    isCovered,
  }
}

export const getClientDebtSummary = (client, fallbackMonthlyFee = CLIENT_PRICE) => {
  if (!client) {
    return {
      debtMonths: 0,
      debtAmount: 0,
      monthlyFee: fallbackMonthlyFee,
      fractionalDebt: 0,
      totalDue: 0,
    }
  }

  const monthlyFee = getClientMonthlyFee(client, fallbackMonthlyFee)
  const coverage = getClientCoverageContext(client)
  const debtMonths = Math.max(Number(coverage.debtMonths ?? 0), 0)
  const debtAmount = coverage.hasPartial ? Math.max(monthlyFee - Number(coverage.partialAmount ?? 0), 0) : 0
  const fractionalDebt = getFractionalDebt(debtMonths)
  const totalDue = debtMonths * monthlyFee + debtAmount

  return {
    debtMonths,
    debtAmount,
    monthlyFee,
    fractionalDebt,
    totalDue,
  }
}

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  DUE_SOON: 'due_soon',
  PAID: 'paid',
}

export const DUE_SOON_THRESHOLD_MONTHS = 1

export const getClientPaymentStatus = (client, fallbackMonthlyFee = CLIENT_PRICE) => {
  const debtSummary = getClientDebtSummary(client, fallbackMonthlyFee)
  const coverage = getClientCoverageContext(client)

  if (debtSummary.monthlyFee <= 0) {
    return PAYMENT_STATUS.PAID
  }

  if (coverage.isCovered) {
    return coverage.aheadMonths < DUE_SOON_THRESHOLD_MONTHS
      ? PAYMENT_STATUS.DUE_SOON
      : PAYMENT_STATUS.PAID
  }

  if (coverage.hasPartial && debtSummary.debtAmount <= debtSummary.monthlyFee) {
    return PAYMENT_STATUS.DUE_SOON
  }

  if (debtSummary.debtMonths > 0 || debtSummary.debtAmount > 0) {
    return PAYMENT_STATUS.PENDING
  }

  return PAYMENT_STATUS.PENDING
}
