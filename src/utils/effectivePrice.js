export const resolveEffectivePriceForFormState = (formState, plan) => {
  if (!plan) {
    return null
  }

  if (formState?.isCustomPriceEnabled) {
    const customValue = Number(formState?.price)
    if (Number.isFinite(customValue)) {
      return customValue
    }
  }

  if (plan.monthlyPrice !== undefined && plan.monthlyPrice !== null) {
    const planPrice = Number(plan.monthlyPrice)
    if (Number.isFinite(planPrice)) {
      return planPrice
    }
  }

  if (plan.defaultMonthlyFee !== undefined && plan.defaultMonthlyFee !== null) {
    const fallbackPrice = Number(plan.defaultMonthlyFee)
    if (Number.isFinite(fallbackPrice)) {
      return fallbackPrice
    }
  }

  if (formState && formState.price !== '' && formState.price !== null && formState.price !== undefined) {
    const numericPrice = Number(formState.price)
    if (Number.isFinite(numericPrice)) {
      return numericPrice
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
