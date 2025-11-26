import { describe, expect, it, vi } from 'vitest'
import {
  handleCreateClientFlow,
  handleAssignServiceFlow,
  handleUpdateServiceStatusFlow,
  handleDeleteClientFlow,
  handleDeleteServiceFlow,
  buildErrorMessage,
} from '../src/features/clients/flows.js'

const sampleError = { response: { data: { message: 'Detalle' } } }

describe('clients flows helpers', () => {
  it('ejecuta alta con servicio inicial', async () => {
    const createClient = vi.fn().mockResolvedValue({ id: '1' })
    const createClientService = vi.fn().mockResolvedValue({})

    const created = await handleCreateClientFlow({
      clientPayload: { name: 'Nuevo' },
      servicePayload: { servicePlanId: 'plan-1' },
      createClient,
      createClientService,
    })

    expect(created.id).toBe('1')
    expect(createClientService).toHaveBeenCalled()
  })

  it('ejecuta asignación y cambios de estado', async () => {
    const assign = vi.fn().mockResolvedValue({})
    const update = vi.fn().mockResolvedValue({})

    await handleAssignServiceFlow({ payload: { clientId: '1', servicePlanId: 'x' }, createClientService: assign })
    await handleUpdateServiceStatusFlow({ serviceId: 's1', status: 'suspended', updateClientServiceStatus: update })

    expect(assign).toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith('s1', { status: 'suspended' })
  })

  it('ejecuta bajas con normalización', async () => {
    const deleteClient = vi.fn().mockResolvedValue({})
    const deleteService = vi.fn().mockResolvedValue({})

    await handleDeleteClientFlow({ clientId: 2, deleteClient })
    await handleDeleteServiceFlow({ serviceId: 'svc', deleteClientService: deleteService })

    expect(deleteClient).toHaveBeenCalledWith('2')
    expect(deleteService).toHaveBeenCalledWith('svc')
  })

  it('construye mensajes de error', () => {
    expect(buildErrorMessage(sampleError, 'Fallback')).toBe('Detalle')
    expect(buildErrorMessage({ message: 'Otro' }, 'Fallback')).toBe('Otro')
  })
})
