import { CLIENT_PRICE, DEFAULT_VOUCHER_PRICES } from '../constants.js'
import {
  normalizeDecimal,
  normalizeTextOrNull,
  parseDecimalOrNull,
} from '../utils/normalizers.js'

export const voucherTypePrices = DEFAULT_VOUCHER_PRICES

export const VOUCHER_TYPE_IDS = { h1: 1, h3: 2, d1: 3, w1: 4, d15: 5, m1: 6 }

export const voucherTypeKeyById = Object.fromEntries(
  Object.entries(VOUCHER_TYPE_IDS).map(([key, id]) => [String(id), key]),
)

const isInternetLikeService = (serviceType) =>
  serviceType === 'internet' || serviceType === 'hotspot'

export const mapClientService = (service) => ({
  id: service.id,
  clientId: service.client_id ?? service.clientId ?? null,
  servicePlanId: service.service_plan_id ?? service.servicePlanId ?? null,
  plan: service.service_plan ? mapServicePlan(service.service_plan) : null,
  type:
    service.service_plan?.category ?? service.category ?? service.type ?? null,
  name:
    service.service_plan?.name ?? service.name ?? service.display_name ?? 'Servicio',
  status: service.status,
  billingDay: service.billing_day ?? null,
  nextBillingDate: service.next_billing_date ?? null,
  baseId: service.base_id ?? null,
  ipAddress: service.ip_address ?? null,
  customPrice: normalizeDecimal(service.custom_price),
  effectivePrice: normalizeDecimal(
    service.effective_price ?? service.effectivePrice ?? service.custom_price,
  ),
  price: normalizeDecimal(
    service.effective_price ?? service.custom_price,
  ),
  currency: service.currency ?? 'MXN',
  baseId: service.base_id ?? null,
  notes: service.notes ?? '',
  metadata: service.metadata ?? {},
  createdAt: service.created_at ?? null,
  updatedAt: service.updated_at ?? null,
})

export const mapServicePlan = (plan) => ({
  id: plan.id ?? plan.plan_id ?? null,
  name: plan.name ?? '',
  category: plan.category ?? plan.service_type ?? 'internet',
  monthlyPrice: normalizeDecimal(
    plan.monthly_price ?? plan.default_monthly_fee ?? 0,
  ),
  defaultMonthlyFee: normalizeDecimal(
    plan.monthly_price ?? plan.default_monthly_fee ?? 0,
  ),
  description: plan.description ?? '',
  status: plan.status ?? (plan.is_active === false ? 'inactive' : 'active'),
  isActive: plan.status
    ? String(plan.status).toLowerCase() === 'active'
    : plan.is_active ?? true,
  requiresIp: Boolean(plan.requires_ip),
  requiresBase: Boolean(plan.requires_base),
  capacityType: plan.capacity_type ?? 'unlimited',
  capacityLimit: plan.capacity_limit ?? null,
  createdAt: plan.created_at ?? null,
  serviceType: plan.category ?? plan.service_type ?? 'internet',
})

const mapRecentPayment = (payment) => ({
  id: payment.id,
  date: payment.paid_on,
  method: payment.method,
  months: normalizeDecimal(payment.months_paid),
  amount: normalizeDecimal(payment.amount),
  note: payment.note ?? '',
  periodKey: payment.period_key ?? null,
  serviceId: payment.client_service_id ?? null,
  serviceName:
    payment.service?.service_plan?.name ?? payment.service?.name ?? 'Servicio',
  serviceType: payment.service?.service_plan?.category ?? null,
})

export const mapClient = (client) => {
  const services = Array.isArray(client.services) ? client.services.map(mapClientService) : []
  const internetService = services.find((service) => isInternetLikeService(service.type))
  const activeServices = services.filter((service) => service.status === 'active')
  const paidService = activeServices.find(
    (service) => normalizeDecimal(service.effectivePrice ?? service.price, 0) > 0,
  )
  const courtesyService = activeServices.find(
    (service) => normalizeDecimal(service.effectivePrice ?? service.price, 0) <= 0,
  )
  const referenceService = paidService ?? courtesyService ?? internetService ?? services[0] ?? null

  const fallbackMonthlyFee = normalizeDecimal(client.monthly_fee, CLIENT_PRICE)
  const referencePrice = referenceService
    ? normalizeDecimal(referenceService.effectivePrice ?? referenceService.price, 0)
    : fallbackMonthlyFee
  const isCourtesy = referenceService
    ? referencePrice <= 0
    : fallbackMonthlyFee <= 0
  const normalizedMonthlyFee = isCourtesy
    ? 0
    : referenceService
      ? referencePrice
      : fallbackMonthlyFee
  const normalizedDebtMonths = isCourtesy ? 0 : normalizeDecimal(client.debt_months)
  const normalizedAheadMonths = isCourtesy ? 0 : normalizeDecimal(client.paid_months_ahead)
  const normalizedServiceStatus = (() => {
    const rawStatus = client.service_status
    if (rawStatus === 'Activo' || rawStatus === 'Suspendido') {
      return rawStatus
    }

    if (typeof rawStatus === 'string') {
      const lowerStatus = rawStatus.toLowerCase()
      if (lowerStatus === 'active') {
        return 'Activo'
      }
      if (lowerStatus === 'suspended') {
        return 'Suspendido'
      }
    }

    return null
  })()

  const serviceStatus = normalizedServiceStatus ?? (activeServices.length > 0 ? 'Activo' : 'Suspendido')

  const recentPayments = Array.isArray(client.recent_payments)
    ? client.recent_payments.map(mapRecentPayment)
    : []

  return {
    id: client.id,
    type: client.client_type,
    name: client.full_name,
    location: client.location,
    base: client.base_id,
    ip: client.ip_address,
    antennaIp: client.antenna_ip,
    modemIp: client.modem_ip,
    monthlyFee: normalizedMonthlyFee,
    paidMonthsAhead: normalizedAheadMonths,
    debtMonths: normalizedDebtMonths,
    service: serviceStatus,
    services,
    recentPayments,
    isCourtesyService: isCourtesy,
  }
}

export const mapPayment = (payment) => ({
  id: payment.id,
  date: payment.paid_on,
  method: payment.method,
  months: normalizeDecimal(payment.months_paid),
  amount: normalizeDecimal(payment.amount),
  note: payment.note ?? '',
  periodKey: payment.period_key ?? null,
  clientName: payment.client?.full_name ?? 'Cliente',
  clientId: payment.client_id ?? payment.client?.id ?? null,
  serviceId: payment.client_service_id ?? payment.service?.id ?? null,
  serviceName:
    payment.service?.service_plan?.name ?? payment.service?.name ?? 'Servicio',
  serviceType: payment.service?.service_plan?.category ?? null,
})

export const mapExpense = (expense) => ({
  id: expense.id,
  date: expense.expense_date,
  desc: expense.description,
  cat: expense.category,
  amount: normalizeDecimal(expense.amount),
  base: expense.base_id,
})

export const mapInventoryItem = (item) => ({
  id: item.id,
  brand: item.brand,
  model: item.model,
  serial: item.serial_number,
  assetTag: item.asset_tag,
  base: item.base_id,
  ip: item.ip_address,
  status: item.status,
  location: item.location,
  client: item.client_id,
  notes: item.notes,
  installedAt: item.installed_at,
})

export const mapReseller = (reseller) => {
  const deliveries = (reseller.deliveries ?? []).map((delivery) => ({
    id: delivery.id,
    date: delivery.delivered_on,
    settled: delivery.settlement_status === 'settled',
    totalValue: normalizeDecimal(delivery.total_value),
    qty: (delivery.items ?? []).reduce((acc, item) => {
      const voucherKey =
        voucherTypeKeyById[String(item.voucher_type_id)] ?? `type-${item.voucher_type_id}`
      acc[voucherKey] = item.quantity
      return acc
    }, {}),
  }))

  const deliveriesById = new Map(deliveries.map((delivery) => [delivery.id, delivery]))

  const settlements = (reseller.settlements ?? []).map((settlement) => {
    const amount = normalizeDecimal(settlement.amount)
    const myGain = normalizeDecimal(settlement.my_gain ?? settlement.amount)

    const relatedDeliveryId = settlement.delivery_id ?? settlement.deliveryId ?? null
    const relatedDelivery = relatedDeliveryId ? deliveriesById.get(relatedDeliveryId) ?? null : null

    const totalFromApi =
      parseDecimalOrNull(settlement.total) ??
      parseDecimalOrNull(settlement.total_value) ??
      parseDecimalOrNull(settlement.expected_total)

    const receivedFromApi =
      parseDecimalOrNull(settlement.received) ??
      parseDecimalOrNull(settlement.received_amount) ??
      parseDecimalOrNull(settlement.amount_received)

    const diffFromApi =
      parseDecimalOrNull(settlement.diff) ??
      parseDecimalOrNull(settlement.difference) ??
      parseDecimalOrNull(settlement.balance)

    const totalSoldFromApi =
      parseDecimalOrNull(settlement.totalSold) ??
      parseDecimalOrNull(settlement.total_sold) ??
      parseDecimalOrNull(settlement.vouchers_sold) ??
      parseDecimalOrNull(settlement.sold)

    const settlementItemsTotal = Array.isArray(settlement.items)
      ? settlement.items.reduce((acc, item) => acc + (parseDecimalOrNull(item?.quantity) ?? 0), 0)
      : null

    const deliveryQtyTotal = relatedDelivery
      ? Object.values(relatedDelivery.qty ?? {}).reduce(
          (acc, qty) => acc + (parseDecimalOrNull(qty) ?? 0),
          0,
        )
      : null

    const total = totalFromApi ?? relatedDelivery?.totalValue ?? amount
    const received = receivedFromApi ?? amount
    const totalSold = totalSoldFromApi ?? settlementItemsTotal ?? deliveryQtyTotal ?? 0
    const diff = diffFromApi ?? received - total

    return {
      id: settlement.id,
      date: settlement.settled_on,
      amount,
      note: settlement.notes ?? '',
      myGain,
      total,
      totalSold,
      received,
      diff,
    }
  })

  return {
    id: reseller.id,
    name: reseller.full_name,
    base: reseller.base_id,
    location: reseller.location,
    deliveries,
    settlements,
  }
}

export const mapPrincipalAccount = (account) => ({
  id: account.id,
  email: account.email_principal,
  note: account.nota ?? '',
  createdAt: account.fecha_alta,
})

export const mapClientAccount = (account) => ({
  id: account.id,
  principalId: account.principal_account_id ?? null,
  email: account.correo_cliente ?? '',
  profile: account.perfil ?? '',
  name: account.nombre_cliente ?? '',
  status: account.estatus ?? 'activo',
  registeredAt: account.fecha_registro,
  nextPayment: account.fecha_proximo_pago,
})

export const serializeClientPayload = (payload) => ({
  client_type: payload.type,
  full_name: payload.name,
  location: payload.location,
  base_id: payload.base,
  ip_address: payload.ip || null,
  antenna_ip: payload.antennaIp || null,
  modem_ip: payload.modemIp || null,
  antenna_model: payload.antennaModel || null,
  modem_model: payload.modemModel || null,
  monthly_fee: payload.monthlyFee ?? CLIENT_PRICE,
  paid_months_ahead: payload.paidMonthsAhead ?? 0,
  debt_months: payload.debtMonths ?? 0,
  service_status: payload.service ?? 'Activo',
})

export const serializeClientServicePayload = (payload) => {
  const body = {
    client_id: payload.clientId,
    service_plan_id: payload.servicePlanId,
  }

  if (payload.status) {
    body.status = payload.status
  }

  if (payload.billingDay) {
    body.billing_day = payload.billingDay
  }

  if (payload.nextBillingDate) {
    body.next_billing_date = payload.nextBillingDate
  }

  if (payload.baseId) {
    body.base_id = payload.baseId
  }

  if (payload.ipAddress) {
    body.ip_address = payload.ipAddress
  }

  if (payload.customPrice !== undefined && payload.customPrice !== null) {
    body.custom_price = payload.customPrice
  }

  if (payload.notes) {
    body.notes = payload.notes
  }

  if (payload.metadata) {
    body.metadata = payload.metadata
  }

  return body
}

export const serializeClientServiceBulkPayload = (payload) => {
  const body = {
    service_plan_id: payload.servicePlanId,
    client_ids: Array.isArray(payload.clientIds) ? payload.clientIds : [],
  }

  if (payload.status) {
    body.status = payload.status
  }

  if (payload.billingDay) {
    body.billing_day = payload.billingDay
  }

  if (payload.nextBillingDate) {
    body.next_billing_date = payload.nextBillingDate
  }

  if (payload.baseId) {
    body.base_id = payload.baseId
  }

  if (payload.ipAddress) {
    body.ip_address = payload.ipAddress
  }

  if (payload.customPrice !== undefined && payload.customPrice !== null) {
    body.custom_price = payload.customPrice
  }

  if (payload.notes) {
    body.notes = payload.notes
  }

  if (payload.metadata) {
    body.metadata = payload.metadata
  }

  return body
}

export const serializeClientServiceUpdatePayload = (payload = {}) => {
  const body = {}

  if (payload.servicePlanId) {
    body.service_plan_id = payload.servicePlanId
  }

  if (payload.status) {
    body.status = payload.status
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'billingDay')) {
    body.billing_day = payload.billingDay ?? null
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'nextBillingDate')) {
    body.next_billing_date = payload.nextBillingDate ?? null
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'baseId')) {
    body.base_id = payload.baseId ?? null
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'ipAddress')) {
    body.ip_address = payload.ipAddress ?? null
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'customPrice')) {
    body.custom_price = payload.customPrice ?? null
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'notes')) {
    body.notes = payload.notes ?? null
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'metadata')) {
    body.metadata = payload.metadata ?? null
  }

  return body
}

export const serializeServicePlanPayload = (payload) => {
  const body = {
    name: payload.name,
    category: payload.category ?? payload.serviceType ?? 'internet',
    monthly_price: payload.monthlyPrice ?? payload.defaultMonthlyFee ?? 0,
    status: payload.status ?? (payload.isActive === false ? 'inactive' : 'active'),
    requires_ip: payload.requiresIp ?? false,
    requires_base: payload.requiresBase ?? false,
  }

  if (payload.capacityType) {
    body.capacity_type = payload.capacityType
  }

  if (payload.capacityLimit !== undefined) {
    body.capacity_limit = payload.capacityLimit ?? null
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    if (payload.description === null) {
      body.description = null
    } else if (typeof payload.description === 'string') {
      const trimmed = payload.description.trim()
      body.description = trimmed ? trimmed : null
    }
  }

  return body
}

export const serializeClientAccountPayload = (payload) => {
  const body = {
    principal_account_id: payload.principalAccountId,
    correo_cliente: payload.email?.trim(),
    contrasena_cliente: payload.password,
    perfil: payload.profile?.trim(),
    nombre_cliente: payload.name?.trim(),
    estatus: (payload.status ?? 'activo').trim(),
  }

  if (payload.registeredAt) {
    body.fecha_registro = payload.registeredAt
  }

  if (payload.nextPayment) {
    body.fecha_proximo_pago = payload.nextPayment
  }

  return body
}

export const convertBaseCosts = (baseCosts = {}) =>
  Object.entries(baseCosts).reduce((acc, [baseId, value]) => {
    const key = `base${baseId}`
    acc[key] = normalizeDecimal(value)
    return acc
  }, {})
