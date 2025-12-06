export const SERVICE_TYPE_OPTIONS = [
  { value: 'internet', label: 'Internet' },
  { value: 'streaming', label: 'Streaming' },
  { value: 'hotspot', label: 'Hotspot / Fichas' },
  { value: 'other', label: 'Otro servicio mensual' },
]

const BASE_SERVICE_TYPE_LABELS = {
  point_of_sale: 'Punto de venta',
}

export const SERVICE_TYPE_LABELS = SERVICE_TYPE_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label
    return acc
  },
  { ...BASE_SERVICE_TYPE_LABELS },
)

export const getServiceTypeLabel = (type) => SERVICE_TYPE_LABELS[type] ?? 'Servicio mensual'

export const SERVICE_STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'suspended', label: 'Suspendido' },
  { value: 'cancelled', label: 'Baja' },
]

const EXTRA_SERVICE_STATUS_LABELS = {
  pending_installation: 'Por instalar',
  installation_pending: 'Por instalar',
  billing_blocked: 'Bloqueo de facturación',
  blocked: 'Bloqueado',
}

export const SERVICE_STATUS_LABELS = SERVICE_STATUS_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label
    return acc
  },
  { ...EXTRA_SERVICE_STATUS_LABELS },
)

export const getServiceStatusLabel = (status) => SERVICE_STATUS_LABELS[status] ?? 'Desconocido'
