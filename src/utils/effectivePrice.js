export const resolveEffectivePriceForFormState = (formState, plan) => {
  if (!plan) {
    return null
  }

  const hasPriceValue =
    formState && formState.price !== '' && formState.price !== null && formState.price !== undefined

  if (hasPriceValue) {
    const customValue = Number(formState.price)
    if (Number.isFinite(customValue)) {
      return customValue
    }
  }

  const monthlyPrice = plan.monthlyPrice ?? plan.defaultMonthlyFee
  if (monthlyPrice !== undefined && monthlyPrice !== null) {
    const planPrice = Number(monthlyPrice)
    if (Number.isFinite(planPrice)) {
      return planPrice
    }
  }

  return null
}

export const isCourtesyPrice = (price) => {
  if (price === null || price === undefined) {
    return false
  }
  const numeric = Number(price)
  if (!Number.isFinite(numeric)) {
    return false
  }
  return numeric <= 0
}
