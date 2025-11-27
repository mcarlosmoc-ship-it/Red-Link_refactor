import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Card, CardContent } from '../components/ui/Card.jsx'
import ClientsList from '../features/clients/ClientsList.jsx'
import ClientForm from '../features/clients/ClientForm.jsx'
import ClientDetailTabs from '../features/clients/ClientDetailTabs.jsx'
import ServicesAssignments from '../features/clients/ServicesAssignments.jsx'
import { useBackofficeStore } from '../store/useBackofficeStore.js'
import { useClients } from '../hooks/useClients.js'
import { useServicePlans } from '../hooks/useServicePlans.js'
import { useClientServices } from '../hooks/useClientServices.js'
import { useToast } from '../hooks/useToast.js'
import { useBackofficeRefresh } from '../contexts/BackofficeRefreshContext.jsx'
import ClientsSkeleton from './ClientsSkeleton.jsx'
import MonthlyServicesPage from './MonthlyServices.jsx'
import { getPrimaryService, normalizeId, resolveApiErrorMessage } from '../features/clients/utils.js'
import {
  handleAssignServiceFlow,
  handleCreateClientFlow,
  handleDeleteClientFlow,
  handleDeleteServiceFlow,
  handleUpdateServiceStatusFlow,
} from '../features/clients/flows.js'

const MAIN_TABS = [
  { id: 'clients', label: 'Clientes' },
  { id: 'services', label: 'Servicios mensuales' },
]

export default function ClientsPage() {
  const { initializeStatus } = useBackofficeStore((state) => ({
    initializeStatus: state.status.initialize,
  }))
  const { isRefreshing } = useBackofficeRefresh()
  const location = useLocation()
  const {
    clients,
    status: clientsStatus,
    reload: reloadClients,
    createClient,
    createClientService,
    bulkAssignClientServices,
    updateClientServiceStatus,
    deleteClient,
  } = useClients()
  const { deleteClientService } = useClientServices({ autoLoad: false })
  const { servicePlans, status: servicePlansStatus } = useServicePlans()
  const { showToast } = useToast()
  const [activeMainTab, setActiveMainTab] = useState('clients')
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessingService, setIsProcessingService] = useState(false)

  useEffect(() => {
    if (location.hash?.includes('services')) {
      setActiveMainTab('services')
    }
  }, [location.hash])

  const selectedClient = useMemo(
    () => clients.find((client) => normalizeId(client.id) === normalizeId(selectedClientId)) ?? null,
    [clients, selectedClientId],
  )

  const handleCreateClient = async ({ client, service }) => {
    setIsSubmitting(true)
    try {
      const created = await handleCreateClientFlow({
        clientPayload: client,
        servicePayload: service,
        createClient,
        createClientService,
      })
      showToast({
        type: 'success',
        title: 'Cliente creado',
        description: 'El cliente se registró correctamente.',
      })
      setSelectedClientId(normalizeId(created.id))
      return created
    } catch (error) {
      const description = resolveApiErrorMessage(error, 'No se pudo crear el cliente.')
      showToast({ type: 'error', title: 'Error al crear cliente', description })
      throw new Error(description)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteClient = async (clientId) => {
    const normalizedId = normalizeId(clientId)
    if (!normalizedId) return

    try {
      await handleDeleteClientFlow({ clientId: normalizedId, deleteClient })
      showToast({
        type: 'success',
        title: 'Cliente eliminado',
        description: 'Se eliminó el cliente seleccionado.',
      })
      if (selectedClientId === normalizedId) {
        setSelectedClientId(null)
      }
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo eliminar',
        description: resolveApiErrorMessage(error, 'Intenta nuevamente.'),
      })
    }
  }

  const buildBulkSummaryToast = ({
    title,
    action,
    successCount,
    failureCount,
    total,
    errorMessage,
  }) => {
    if (successCount > 0) {
      showToast({
        type: failureCount > 0 ? 'warning' : 'success',
        title,
        description: `${action} en ${successCount} de ${total} clientes` +
          (failureCount > 0 ? `, ${failureCount} con errores.` : '.'),
      })
    } else {
      showToast({
        type: 'error',
        title,
        description: errorMessage ?? 'No se pudo completar la acción.',
      })
    }
  }

  const handleBulkAssignServices = async ({ clientIds, servicePlanId }) => {
    const normalizedClientIds = (clientIds ?? []).map(normalizeId).filter(Boolean)
    if (!servicePlanId || normalizedClientIds.length === 0) {
      return
    }

    const parsedPlanId = Number(servicePlanId)
    const normalizedPlanId = Number.isFinite(parsedPlanId) ? parsedPlanId : servicePlanId

    setIsProcessingService(true)
    try {
      const createdServices = await bulkAssignClientServices({
        clientIds: normalizedClientIds,
        servicePlanId: normalizedPlanId,
        status: 'active',
      })

      const successCount = Array.isArray(createdServices) ? createdServices.length : 0
      const failureCount = Math.max(normalizedClientIds.length - successCount, 0)

      buildBulkSummaryToast({
        title: 'Asignación masiva',
        action: 'Servicio asignado',
        successCount,
        failureCount,
        total: normalizedClientIds.length,
        errorMessage: 'No se pudieron asignar los servicios seleccionados.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Asignación masiva',
        description: resolveApiErrorMessage(error, 'No se pudo completar la asignación.'),
      })
      throw error
    } finally {
      setIsProcessingService(false)
    }
  }

  const handleBulkChangeServiceStatus = async ({ clientIds, status }) => {
    const normalizedClientIds = (clientIds ?? []).map(normalizeId).filter(Boolean)
    if (!status || normalizedClientIds.length === 0) {
      return
    }

    setIsProcessingService(true)
    let successCount = 0
    let failureCount = 0
    let firstError = null

    for (const clientId of normalizedClientIds) {
      const client = clients.find((item) => normalizeId(item.id) === clientId)
      const primaryService = getPrimaryService(client)
      if (!client || !primaryService) {
        failureCount += 1
        continue
      }

      try {
        await updateClientServiceStatus(client.id, primaryService.id, status)
        successCount += 1
      } catch (error) {
        failureCount += 1
        if (!firstError) {
          firstError = error
        }
      }
    }

    buildBulkSummaryToast({
      title: 'Actualización masiva',
      action: `Estado ${status === 'suspended' ? 'suspendido' : 'activado'}`,
      successCount,
      failureCount,
      total: normalizedClientIds.length,
      errorMessage: resolveApiErrorMessage(firstError, 'No se pudieron actualizar los servicios.'),
    })

    setIsProcessingService(false)
  }

  const handleBulkDeleteServices = async (clientIds) => {
    const normalizedClientIds = (clientIds ?? []).map(normalizeId).filter(Boolean)
    if (normalizedClientIds.length === 0) {
      return
    }

    setIsProcessingService(true)
    let successCount = 0
    let failureCount = 0
    let firstError = null

    for (const clientId of normalizedClientIds) {
      const client = clients.find((item) => normalizeId(item.id) === clientId)
      const primaryService = getPrimaryService(client)
      if (!client || !primaryService) {
        failureCount += 1
        continue
      }

      try {
        await deleteClientService(primaryService.id)
        successCount += 1
      } catch (error) {
        failureCount += 1
        if (!firstError) {
          firstError = error
        }
      }
    }

    buildBulkSummaryToast({
      title: 'Eliminación masiva',
      action: 'Servicio eliminado',
      successCount,
      failureCount,
      total: normalizedClientIds.length,
      errorMessage: resolveApiErrorMessage(firstError, 'No se pudieron eliminar los servicios.'),
    })

    setIsProcessingService(false)
  }

  const handleAssignService = async (payload) => {
    setIsProcessingService(true)
    try {
      await handleAssignServiceFlow({ payload, createClientService })
      showToast({
        type: 'success',
        title: 'Servicio asignado',
        description: 'Se registró el servicio para el cliente.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo asignar',
        description: resolveApiErrorMessage(error),
      })
    } finally {
      setIsProcessingService(false)
    }
  }

  const handleUpdateServiceStatus = async (serviceId, status) => {
    if (!serviceId) return
    setIsProcessingService(true)
    try {
      await handleUpdateServiceStatusFlow({
        serviceId,
        status,
        updateClientServiceStatus,
      })
      showToast({
        type: 'success',
        title: 'Servicio actualizado',
        description: 'El estado del servicio se actualizó correctamente.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo actualizar',
        description: resolveApiErrorMessage(error),
      })
    } finally {
      setIsProcessingService(false)
    }
  }

  const handleDeleteService = async (serviceId) => {
    if (!serviceId) return
    setIsProcessingService(true)
    try {
      await handleDeleteServiceFlow({ serviceId, deleteClientService })
      showToast({
        type: 'success',
        title: 'Servicio eliminado',
        description: 'Se removió el servicio del cliente.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo eliminar',
        description: resolveApiErrorMessage(error),
      })
    } finally {
      setIsProcessingService(false)
    }
  }

  if (initializeStatus?.isLoading || isRefreshing) {
    return <ClientsSkeleton />
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap gap-2 pt-6">
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`rounded px-4 py-2 text-sm font-medium ${
                activeMainTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200'
              }`}
              onClick={() => setActiveMainTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </CardContent>
      </Card>

      {activeMainTab === 'services' ? (
        <MonthlyServicesPage />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <ClientsList
              clients={clients}
              status={clientsStatus}
              onReload={reloadClients}
              onSelectClient={setSelectedClientId}
              selectedClientId={selectedClientId}
              onDeleteClient={handleDeleteClient}
              onBulkAssignServices={handleBulkAssignServices}
              onBulkChangeServiceStatus={handleBulkChangeServiceStatus}
              onBulkDeleteServices={handleBulkDeleteServices}
              servicePlans={servicePlans}
              isProcessing={isProcessingService || clientsStatus?.isMutating}
            />
            {selectedClient && <ClientDetailTabs client={selectedClient} />}
          </div>
          <div className="space-y-4">
            <ClientForm
              servicePlans={servicePlans}
              onSubmit={handleCreateClient}
              isSubmitting={isSubmitting}
            />
            <ServicesAssignments
              client={selectedClient}
              servicePlans={servicePlans}
              onAssign={handleAssignService}
              onChangeStatus={handleUpdateServiceStatus}
              onDeleteService={handleDeleteService}
              isProcessing={isProcessingService || servicePlansStatus?.isLoading}
            />
          </div>
        </div>
      )}
    </div>
  )
}
