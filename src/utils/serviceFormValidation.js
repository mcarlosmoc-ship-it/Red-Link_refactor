import { SERVICE_STATUS_OPTIONS } from '../constants/serviceTypes.js'

const SERVICE_STATUS_VALUES = new Set(SERVICE_STATUS_OPTIONS.map((option) => option.value))

const isBillingDayRequired = (plan) => {
  if (!plan) {
    return false
  }
  const category = plan.serviceType ?? plan.category ?? null
  return Boolean(plan.requiresIp || plan.requiresBase || category === 'internet' || category === 'hotspot')
}

export const computeServiceFormErrors = (
  state,
  { requireClientId = false, plan = null } = {},
) => {
  const errors = {}

  const planId = state?.servicePlanId
  if (!planId) {
    errors.servicePlanId = 'Selecciona un servicio mensual.'
  }

  const billingDayValue = state?.billingDay
  if (billingDayValue !== '' && billingDayValue !== null && billingDayValue !== undefined) {
    const parsedDay = Number(billingDayValue)
    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      errors.billingDay = 'Indica un día de cobro entre 1 y 31.'
    }
  } else if (isBillingDayRequired(plan)) {
    errors.billingDay = 'Selecciona un día de cobro entre 1 y 31.'
  }

  const baseIdValue = state?.baseId
  if (plan?.requiresBase) {
    const parsedBase = Number(baseIdValue)
    if (!Number.isInteger(parsedBase) || parsedBase < 1) {
      errors.baseId = 'Selecciona una base válida.'
    }
  } else if (baseIdValue !== '' && baseIdValue !== null && baseIdValue !== undefined) {
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

  return errors
}

export default computeServiceFormErrors
