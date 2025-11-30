import { getServiceTypeLabel } from '../constants/serviceTypes.js'
import { peso } from './formatters.js'

const NORMALIZED_CATEGORIES = new Set(['internet', 'streaming', 'hotspot', 'other'])

const DEFAULT_PLAN_REQUIREMENTS = {
  internet: {
    requiresIp: true,
    requiresBase: true,
    requiresCredentials: false,
    requiresEquipment: true,
  },
  hotspot: {
    requiresIp: true,
    requiresBase: true,
    requiresCredentials: false,
    requiresEquipment: true,
  },
  streaming: {
    requiresIp: false,
    requiresBase: false,
    requiresCredentials: true,
    requiresEquipment: false,
  },
  other: {
    requiresIp: false,
    requiresBase: false,
    requiresCredentials: false,
    requiresEquipment: false,
  },
}

const FLAG_KEYS = {
  requiresIp: ['requiresIp', 'requires_ip'],
  requiresBase: ['requiresBase', 'requires_base'],
  requiresCredentials: ['requiresCredentials', 'requireCredentials', 'requires_credentials'],
  requiresEquipment: ['requiresEquipment', 'requireEquipment', 'requires_equipment'],
}

const resolvePlanMetadata = (plan) => {
  if (!plan || typeof plan !== 'object') return {}
  if (plan.metadata && typeof plan.metadata === 'object') return plan.metadata
  if (plan.serviceMetadata && typeof plan.serviceMetadata === 'object') return plan.serviceMetadata
  return {}
}

const resolveFlag = (plan, flag) => {
  if (!FLAG_KEYS[flag]) return false
  const metadata = resolvePlanMetadata(plan)
  for (const key of FLAG_KEYS[flag]) {
    if (plan && plan[key] !== undefined) {
      return Boolean(plan[key])
    }
    if (metadata[key] !== undefined) {
      return Boolean(metadata[key])
    }
  }
  return undefined
}

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

export const resolvePlanRequirements = (planOrCategory) => {
  const category = resolveServiceCategory(planOrCategory)
  const defaults = DEFAULT_PLAN_REQUIREMENTS[category] ?? DEFAULT_PLAN_REQUIREMENTS.other

  const requiresIp = resolveFlag(planOrCategory, 'requiresIp')
  const requiresBase = resolveFlag(planOrCategory, 'requiresBase')
  const requiresCredentials = resolveFlag(planOrCategory, 'requiresCredentials')
  const requiresEquipment = resolveFlag(planOrCategory, 'requiresEquipment')

  return {
    requiresIp: requiresIp ?? defaults.requiresIp,
    requiresBase: requiresBase ?? defaults.requiresBase,
    requiresCredentials: requiresCredentials ?? defaults.requiresCredentials,
    requiresEquipment: requiresEquipment ?? defaults.requiresEquipment,
  }
}

export const planRequiresIp = (planOrCategory) => resolvePlanRequirements(planOrCategory).requiresIp

export const planRequiresBase = (planOrCategory) =>
  resolvePlanRequirements(planOrCategory).requiresBase

export const planRequiresCredentials = (planOrCategory) =>
  resolvePlanRequirements(planOrCategory).requiresCredentials

export const planRequiresEquipment = (planOrCategory) =>
  resolvePlanRequirements(planOrCategory).requiresEquipment

export const planRequiresBillingDay = (planOrCategory) => {
  const requirements = resolvePlanRequirements(planOrCategory)
  if (!planOrCategory) {
    return false
  }
  return requirements.requiresBase || requirements.requiresIp
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
