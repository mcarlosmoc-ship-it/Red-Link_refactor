export const computeServicePlanFormErrors = (state = {}) => {
  const errors = {}
  const name = state.name?.trim() ?? ''
  if (!name) {
    errors.name = 'Ingresa el nombre del servicio.'
  }

  if (!state.serviceType) {
    errors.serviceType = 'Selecciona el tipo de servicio.'
  }

  const feeValue = state.defaultMonthlyFee
  if (feeValue !== '' && feeValue !== null && feeValue !== undefined) {
    const parsed = Number(feeValue)
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.defaultMonthlyFee = 'Ingresa una tarifa mensual válida (cero o mayor).'
    }
  }

  return errors
}

export default computeServicePlanFormErrors
