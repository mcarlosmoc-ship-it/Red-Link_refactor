export const computeServicePlanFormErrors = (state = {}) => {
  const errors = {}
  const name = state.name?.trim() ?? ''
  if (!name) {
    errors.name = 'Ingresa el nombre del servicio.'
  }

  if (!state.category) {
    errors.category = 'Selecciona el tipo de servicio.'
  }

  const feeValue = state.monthlyPrice
  if (feeValue !== '' && feeValue !== null && feeValue !== undefined) {
    const parsed = Number(feeValue)
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.monthlyPrice = 'Ingresa una tarifa mensual válida (cero o mayor).'
    }
  }

  if (state.capacityType === 'limited') {
    const limitValue = state.capacityLimit
    const parsedLimit = Number(limitValue)
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
      errors.capacityLimit = 'Indica el número máximo de servicios activos.'
    }
  }

  return errors
}

export default computeServicePlanFormErrors
