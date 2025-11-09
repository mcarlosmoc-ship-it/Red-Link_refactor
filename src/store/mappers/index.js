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

const mapService = (service) => ({
  id: service.id,
  type: service.service_type,
  name: service.display_name,
  status: service.status,
  billingDay: service.billing_day ?? null,
  nextBillingDate: service.next_billing_date ?? null,
  price: normalizeDecimal(service.price),
  currency: service.currency ?? 'MXN',
  baseId: service.base_id ?? null,
  notes: service.notes ?? '',
  metadata: service.metadata ?? {},
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
  serviceName: payment.service?.display_name ?? 'Servicio',
  serviceType: payment.service?.service_type ?? null,
})

export const mapClient = (client) => {
  const services = Array.isArray(client.services) ? client.services.map(mapService) : []
  const internetService = services.find((service) => service.type?.startsWith('internet_'))
  const activeServices = services.filter((service) => service.status === 'active')
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
    monthlyFee: normalizeDecimal(internetService?.price ?? client.monthly_fee, CLIENT_PRICE),
    paidMonthsAhead: normalizeDecimal(client.paid_months_ahead),
    debtMonths: normalizeDecimal(client.debt_months),
    service: serviceStatus,
    services,
    recentPayments,
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
  serviceName: payment.service?.display_name ?? 'Servicio',
  serviceType: payment.service?.service_type ?? null,
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
