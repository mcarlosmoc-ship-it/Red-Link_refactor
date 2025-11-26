import { normalizeId, resolveApiErrorMessage } from './utils.js'

export const handleCreateClientFlow = async ({
  clientPayload,
  servicePayload,
  createClient,
  createClientService,
}) => {
  const created = await createClient(clientPayload)
  if (servicePayload?.servicePlanId) {
    await createClientService({ ...servicePayload, clientId: created.id })
  }
  return created
}

export const handleAssignServiceFlow = async ({ payload, createClientService }) => {
  if (!payload?.clientId) {
    throw new Error('Selecciona un cliente válido')
  }
  return createClientService(payload)
}

export const handleUpdateServiceStatusFlow = async ({
  serviceId,
  status,
  updateClientServiceStatus,
}) => {
  if (!serviceId) {
    throw new Error('Selecciona un servicio válido')
  }
  return updateClientServiceStatus(serviceId, { status })
}

export const handleDeleteClientFlow = async ({ clientId, deleteClient }) => {
  const normalizedId = normalizeId(clientId)
  if (!normalizedId) {
    throw new Error('Selecciona un cliente válido para eliminar')
  }
  return deleteClient(normalizedId)
}

export const handleDeleteServiceFlow = async ({ serviceId, deleteClientService }) => {
  if (!serviceId) {
    throw new Error('Selecciona un servicio válido para eliminar')
  }
  return deleteClientService(serviceId)
}

export const buildErrorMessage = (error, fallback) => resolveApiErrorMessage(error, fallback)
