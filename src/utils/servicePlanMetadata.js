import { getServiceTypeLabel } from '../constants/serviceTypes.js'
import { peso } from './formatters.js'

const NORMALIZED_CATEGORIES = new Set(['internet', 'streaming', 'hotspot', 'other'])

const coerceCategory = (raw) => {
  const normalized = String(raw ?? '').toLowerCase()
  if (NORMALIZED_CATEGORIES.has(normalized)) {
    return normalized
  }
  return 'other'
}

export const resolveServiceCategory = (planOrCategory) => {
  if (typeof planOrCategory === 'string') {
    return coerceCategory(planOrCategory)
  }
  const category =
    planOrCategory?.serviceType ??
    planOrCategory?.service_type ??
    planOrCategory?.category ??
    planOrCategory?.type

  return coerceCategory(category)
}

export const resolveServiceCategoryLabel = (planOrCategory) =>
  getServiceTypeLabel(resolveServiceCategory(planOrCategory))

export const isInternetLikeCategory = (planOrCategory) => {
  const category = resolveServiceCategory(planOrCategory)
  return category === 'internet' || category === 'hotspot'
}

export const planRequiresIp = (planOrCategory) => {
  if (!planOrCategory) {
    return false
  }
  if (planOrCategory.requiresIp !== undefined || planOrCategory.requires_ip !== undefined) {
    return Boolean(planOrCategory.requiresIp ?? planOrCategory.requires_ip)
  }
  return isInternetLikeCategory(planOrCategory)
}

export const planRequiresBillingDay = (planOrCategory) => {
  if (!planOrCategory) {
    return false
  }
  const requiresBase = Boolean(planOrCategory.requiresBase ?? planOrCategory.requires_base)
  return requiresBase || planRequiresIp(planOrCategory)
}

export const formatServicePlanLabel = (plan) => {
  const price = Number(plan?.monthlyPrice ?? plan?.defaultMonthlyFee)

  if (Number.isFinite(price) && price > 0) {
    return `${plan.name} · ${peso(price)}`
  }
  if (Number.isFinite(price) && price === 0) {
    return `${plan.name} · ${peso(0)} (cortesía)`
  }

  return `${plan?.name ?? 'Servicio'} · Monto variable`
}

export default resolveServiceCategory
