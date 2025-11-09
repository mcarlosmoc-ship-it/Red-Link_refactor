export const SERVICE_TYPE_OPTIONS = [
  { value: 'internet_private', label: 'Internet residencial' },
  { value: 'internet_tokens', label: 'Internet con fichas' },
  { value: 'streaming_spotify', label: 'Streaming · Spotify' },
  { value: 'streaming_netflix', label: 'Streaming · Netflix' },
  { value: 'streaming_vix', label: 'Streaming · ViX' },
  { value: 'public_desk', label: 'Ciber o escritorio público' },
  { value: 'point_of_sale', label: 'Punto de venta' },
  { value: 'other', label: 'Otro servicio mensual' },
]

export const SERVICE_TYPE_LABELS = SERVICE_TYPE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label
  return acc
}, {})

export const getServiceTypeLabel = (type) => SERVICE_TYPE_LABELS[type] ?? 'Servicio mensual'

export const SERVICE_STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'suspended', label: 'Suspendido' },
  { value: 'cancelled', label: 'Baja' },
]

export const SERVICE_STATUS_LABELS = SERVICE_STATUS_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label
  return acc
}, {})

export const getServiceStatusLabel = (status) => SERVICE_STATUS_LABELS[status] ?? 'Desconocido'
