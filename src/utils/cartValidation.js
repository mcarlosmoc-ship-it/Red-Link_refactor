export const DEFAULT_COMPLEMENTARY_TYPES = {
  INSTALLATION: 'installation',
  RECONNECTION: 'reconnection',
  TECHNICAL_VISIT: 'technical_visit',
}

export const evaluateCartValidation = ({
  cartItems = [],
  selectedClient = null,
  clientServicesByClient = {},
  productLookup = new Map(),
  activePeriodKey = null,
  duplicateServiceReceiptMap = {},
  complementaryTypes = DEFAULT_COMPLEMENTARY_TYPES,
} = {}) => {
  const validation = {}

  cartItems.forEach((item) => {
    let message = ''

    if (item.type === 'product') {
      const product = productLookup.get(item.productId)
      if (product && product.stockQuantity !== null && item.quantity > product.stockQuantity) {
        message = `Stock insuficiente: quedan ${product.stockQuantity}`
      }
    }

    if (item.type === 'punctual-service') {
      if (!selectedClient) {
        message = 'Selecciona un cliente con instalación previa para validar este servicio.'
      } else {
        const services = clientServicesByClient[String(selectedClient.id)] ?? selectedClient.services ?? []
        const hasInstallation = services.some((service) => service.status === 'active')
        const hasSuspended = services.some((service) => service.status === 'suspended')
        const hasCoverage = Boolean(selectedClient.zoneId || selectedClient.zone?.id)
        const alreadyAdded = cartItems.some(
          (other) =>
            other.id !== item.id && other.type === 'punctual-service' && other.clientId === selectedClient.id,
        )

        if (item.complementaryType === complementaryTypes.RECONNECTION && !hasSuspended) {
          message = 'La reconexión solo está disponible para servicios suspendidos.'
        } else if (item.complementaryType === complementaryTypes.INSTALLATION && hasInstallation) {
          message = 'El cliente ya tiene una instalación activa.'
        } else if (!hasInstallation && item.complementaryType !== complementaryTypes.INSTALLATION) {
          message = 'Este servicio requiere una instalación previa activa.'
        } else if (!hasCoverage) {
          message = 'No hay cobertura asignada para el cliente.'
        } else if (alreadyAdded) {
          message = 'Solo se puede agregar un servicio puntual por cliente.'
        }
      }
    }

    if (item.type === 'monthly-service') {
      if (!selectedClient) {
        message = 'Selecciona un cliente con contrato activo para continuar.'
      } else {
        const services = clientServicesByClient[String(selectedClient.id)] ?? selectedClient.services ?? []
        const activeContract = services.some((service) => service.status === 'active')
        if (!activeContract) {
          message = 'El cliente no tiene un contrato activo para facturar este servicio.'
        }

        const duplicateReceipt = duplicateServiceReceiptMap[String(item.servicePlanId)]
        if (duplicateReceipt && item.metadata?.period === duplicateReceipt.period) {
          message = `Ya existe el folio ${
            duplicateReceipt.folio ?? ''
          } para ${duplicateReceipt.period ?? activePeriodKey ?? 'este periodo'}.`.trim()
        }
      }
    }

    if (message) {
      validation[item.id] = message
    }
  })

  return validation
}

export default evaluateCartValidation
