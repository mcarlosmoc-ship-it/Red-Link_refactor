import { SERVICE_STATUS_OPTIONS } from '../constants/serviceTypes.js'

const SERVICE_STATUS_VALUES = new Set(SERVICE_STATUS_OPTIONS.map((option) => option.value))

export const computeServiceFormErrors = (state, { requireClientId = false } = {}) => {
  const errors = {}
  const displayName = state?.displayName?.trim() ?? ''
  if (!displayName) {
    errors.displayName = 'Ingresa el nombre del servicio.'
  }

  if (!state?.serviceType) {
    errors.serviceType = 'Selecciona el tipo de servicio.'
  }

  const priceValue = state?.price
  if (priceValue !== '' && priceValue !== null && priceValue !== undefined) {
    const parsedPrice = Number(priceValue)
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      errors.price = 'Ingresa una tarifa mensual válida (cero o mayor).'
    }
  }

  const billingDayValue = state?.billingDay
  if (billingDayValue !== '' && billingDayValue !== null && billingDayValue !== undefined) {
    const parsedDay = Number(billingDayValue)
    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      errors.billingDay = 'Indica un día de cobro entre 1 y 31.'
    }
  }

  const baseIdValue = state?.baseId
  if (baseIdValue !== '' && baseIdValue !== null && baseIdValue !== undefined) {
    const parsedBase = Number(baseIdValue)
    if (!Number.isInteger(parsedBase) || parsedBase < 1) {
      errors.baseId = 'Selecciona una base válida.'
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
