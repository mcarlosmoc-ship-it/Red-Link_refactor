import { SERVICE_STATUS_OPTIONS } from '../constants/serviceTypes.js'

const SERVICE_STATUS_VALUES = new Set(SERVICE_STATUS_OPTIONS.map((option) => option.value))

const isBillingDayRequired = (plan, effectivePrice) => {
  if (!plan) {
    return false
  }
  const category = plan.serviceType ?? plan.category ?? null
  const requiresSchedule = Boolean(
    plan.requiresIp || plan.requiresBase || category === 'internet' || category === 'hotspot',
  )

  if (!requiresSchedule) {
    return false
  }

  if (typeof effectivePrice === 'number') {
    return effectivePrice > 0
  }

  if (effectivePrice === null || effectivePrice === undefined) {
    if (plan?.monthlyPrice !== undefined && plan?.monthlyPrice !== null) {
      const planPrice = Number(plan.monthlyPrice)
      if (Number.isFinite(planPrice)) {
        return planPrice > 0
      }
    }

    if (
      plan?.defaultMonthlyFee !== undefined &&
      plan?.defaultMonthlyFee !== null
    ) {
      const fallbackPrice = Number(plan.defaultMonthlyFee)
      if (Number.isFinite(fallbackPrice)) {
        return fallbackPrice > 0
      }
    }

    return false
  }

  const numericEffectivePrice = Number(effectivePrice)
  if (Number.isFinite(numericEffectivePrice)) {
    return numericEffectivePrice > 0
  }

  return false
}

const isInternetPlanCategory = (plan) => {
  const category = plan?.serviceType ?? plan?.category ?? plan?.service_type ?? ''
  if (!category) {
    return false
  }
  const normalized = String(category).toLowerCase()
  return normalized === 'internet' || normalized === 'hotspot'
}

const resolveMetadataValue = (state, key) => {
  const metadata = state?.metadata ?? state?.serviceMetadata
  if (!metadata || typeof metadata !== 'object') {
    return ''
  }
  const value = metadata[key]
  return value === null || value === undefined ? '' : String(value)
}

export const computeServiceFormErrors = (
  state,
  {
    requireClientId = false,
    plan = null,
    effectivePrice: overrideEffectivePrice = null,
    validateTechnicalFields = false,
  } = {},
) => {
  const errors = {}

  const planId = state?.servicePlanId
  if (!planId) {
    errors.servicePlanId = 'Selecciona un servicio mensual.'
  }

  const resolvedEffectivePrice = (() => {
    if (typeof overrideEffectivePrice === 'number') {
      return overrideEffectivePrice
    }
    if (overrideEffectivePrice !== null && overrideEffectivePrice !== undefined) {
      const numeric = Number(overrideEffectivePrice)
      if (Number.isFinite(numeric)) {
        return numeric
      }
    }

    if (state?.isCustomPriceEnabled) {
      const customValue = Number(state?.price)
      if (Number.isFinite(customValue)) {
        return customValue
      }
    }

    if (plan && plan.monthlyPrice !== undefined && plan.monthlyPrice !== null) {
      const planPrice = Number(plan.monthlyPrice)
      if (Number.isFinite(planPrice)) {
        return planPrice
      }
    }

    if (plan && plan.defaultMonthlyFee !== undefined && plan.defaultMonthlyFee !== null) {
      const planDefault = Number(plan.defaultMonthlyFee)
      if (Number.isFinite(planDefault)) {
        return planDefault
      }
    }

    return null
  })()

  const billingDayValue = state?.billingDay
  if (billingDayValue !== '' && billingDayValue !== null && billingDayValue !== undefined) {
    const parsedDay = Number(billingDayValue)
    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      errors.billingDay = 'Indica un día de cobro entre 1 y 31.'
    }
  } else if (isBillingDayRequired(plan, resolvedEffectivePrice)) {
    errors.billingDay = 'Selecciona un día de cobro entre 1 y 31.'
  }

  const shouldUseClientBase = Boolean(state?.useClientBase ?? state?.shouldUseClientBase)
  const baseIdValue = state?.baseId
  if (plan?.requiresBase && !shouldUseClientBase) {
    const parsedBase = Number(baseIdValue)
    if (!Number.isInteger(parsedBase) || parsedBase < 1) {
      errors.baseId = 'Selecciona una base válida.'
    }
  } else if (
    !shouldUseClientBase &&
    baseIdValue !== '' &&
    baseIdValue !== null &&
    baseIdValue !== undefined
  ) {
    const parsedBase = Number(baseIdValue)
    if (!Number.isInteger(parsedBase) || parsedBase < 1) {
      errors.baseId = 'Selecciona una base válida.'
    }
  }

  if (state?.isCustomPriceEnabled) {
    const priceValue = state?.price
    if (priceValue === '' || priceValue === null || priceValue === undefined) {
      errors.price = 'Ingresa una tarifa mensual válida (cero o mayor).'
    } else {
      const parsedPrice = Number(priceValue)
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        errors.price = 'Ingresa una tarifa mensual válida (cero o mayor).'
      }
    }
  }

  const statusValue = state?.status
  if (statusValue && !SERVICE_STATUS_VALUES.has(statusValue)) {
    errors.status = 'Selecciona un estado válido.'
  }

  if (requireClientId) {
    const clientId = state?.clientId
    if (!clientId) {
      errors.clientId = 'Selecciona un cliente.'
    }
  }

  const shouldValidateTechnicalFields =
    validateTechnicalFields && (isInternetPlanCategory(plan) || plan?.requiresIp)

  if (shouldValidateTechnicalFields) {
    const ipAddress = state?.ipAddress ?? state?.ip ?? ''
    const antennaIp = state?.antennaIp ?? ''
    const modemIp = state?.modemIp ?? ''
    const networkNode = state?.networkNode ?? resolveMetadataValue(state, 'node')
    const router = state?.router ?? resolveMetadataValue(state, 'router')
    const vlanId = state?.vlanId ?? resolveMetadataValue(state, 'vlan')

    if (!String(ipAddress).trim()) {
      errors.ipAddress = 'Asigna una IP disponible para este servicio.'
    }

    if (!String(networkNode ?? '').trim()) {
      errors.networkNode = 'Indica el nodo o base donde se conecta el servicio.'
    }

    if (!String(router ?? '').trim()) {
      errors.router = 'Define el router o equipo asociado al servicio.'
    }

    if (!String(vlanId ?? '').trim()) {
      errors.vlanId = 'Especifica la VLAN o segmento asignado.'
    }

    if (antennaIp && modemIp && String(antennaIp).trim() === String(modemIp).trim()) {
      errors.antennaIp = 'La IP de antena y del módem deben ser distintas.'
      errors.modemIp = 'La IP de antena y del módem deben ser distintas.'
    }
  }

  return errors
}

export default computeServiceFormErrors
