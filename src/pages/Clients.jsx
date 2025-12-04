import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Card, CardContent } from '../components/ui/Card.jsx'
import ClientsList from '../features/clients/ClientsList.jsx'
import ClientForm from '../features/clients/ClientForm.jsx'
import ClientDetailTabs from '../features/clients/ClientDetailTabs.jsx'
import ServicesAssignments from '../features/clients/ServicesAssignments.jsx'
import ImportClientsModal from '../components/clients/ImportClientsModal.jsx'
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

const CLIENT_TABS = [
  { id: 'list', label: 'Listado' },
  { id: 'create', label: 'Agregar cliente' },
  { id: 'payments', label: 'Adeudos y pagos' },
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
    importClients,
  } = useClients()
  const { deleteClientService, updateClientService } = useClientServices({ autoLoad: false })
  const { servicePlans, status: servicePlansStatus } = useServicePlans()
  const { showToast } = useToast()
  const [activeMainTab, setActiveMainTab] = useState('clients')
  const [activeClientTab, setActiveClientTab] = useState('list')
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [selectedClientIds, setSelectedClientIds] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessingService, setIsProcessingService] = useState(false)
  const [isProcessingSelection, setIsProcessingSelection] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    if (location.hash?.includes('services')) {
      setActiveMainTab('services')
    }
  }, [location.hash])

  const selectedClient = useMemo(
    () => clients.find((client) => normalizeId(client.id) === normalizeId(selectedClientId)) ?? null,
    [clients, selectedClientId],
  )

  const handleSelectClient = (clientId) => {
    const normalizedId = normalizeId(clientId)
    setSelectedClientId(normalizedId)
    if (normalizedId) {
      setActiveClientTab('payments')
    }
  }

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

  const handleUpdateServiceMetadata = async (serviceId, payload) => {
    if (!serviceId) return
    setIsProcessingService(true)
    try {
      await updateClientService(serviceId, payload)
      showToast({
        type: 'success',
        title: 'Servicio actualizado',
        description: 'Se guardaron los cambios del servicio.',
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

  const resolveSelectedClients = (selectedIds = []) =>
    clients.filter((client) => selectedIds.includes(normalizeId(client.id)))

  const resolveTargetIds = (clientIds) => (clientIds?.length ? clientIds : selectedClientIds)

  const handleBulkAssignPlan = async ({ clientIds, servicePlanId }) => {
    const targetIds = resolveTargetIds(clientIds)
    if (!targetIds?.length || !servicePlanId) return

    const normalizedIds = targetIds.map(normalizeId).filter(Boolean)
    const targetClients = resolveSelectedClients(normalizedIds)
    if (targetClients.length === 0) return

    setIsProcessingSelection(true)
    const selectedPlan = servicePlans.find((plan) => normalizeId(plan.id) === normalizeId(servicePlanId))

    try {
      const createdServices = await bulkAssignClientServices({
        clientIds: targetClients.map((client) => client.id),
        servicePlanId,
        status: 'active',
      })

      const successCount = Array.isArray(createdServices) ? createdServices.length : 0
      const failureCount = Math.max(normalizedIds.length - successCount, 0)

      buildBulkSummaryToast({
        title: 'Asignación de plan',
        action: `Plan ${selectedPlan?.name ?? 'seleccionado'} asignado`,
        successCount,
        failureCount,
        total: normalizedIds.length,
        errorMessage: 'No se pudieron asignar los planes seleccionados.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo asignar el plan',
        description: resolveApiErrorMessage(error),
      })
      throw error
    } finally {
      setIsProcessingSelection(false)
    }
  }

  const handleBulkServiceStatus = async (clientIds, nextStatus) => {
    const targetIds = resolveTargetIds(clientIds)
    if (!targetIds?.length || !nextStatus) return

    const normalizedIds = targetIds.map(normalizeId).filter(Boolean)
    const targetClients = resolveSelectedClients(normalizedIds)
    if (targetClients.length === 0) return

    setIsProcessingSelection(true)
    let successCount = 0
    let failureCount = 0
    let firstError = null

    for (const client of targetClients) {
      const primaryService = getPrimaryService(client)
      if (!primaryService?.id) {
        failureCount += 1
        continue
      }

      try {
        await updateClientServiceStatus(client.id, primaryService.id, nextStatus)
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
      action: `Estado ${nextStatus === 'suspended' ? 'suspendido' : 'activado'}`,
      successCount,
      failureCount,
      total: normalizedIds.length,
      errorMessage: resolveApiErrorMessage(firstError, 'No se pudieron actualizar los servicios.'),
    })

    setIsProcessingSelection(false)
  }

  const handleBulkDeleteClients = async (clientIds) => {
    const targetIds = resolveTargetIds(clientIds)
    if (!targetIds?.length) return
    const targetClients = resolveSelectedClients(targetIds)
    if (targetClients.length === 0) return

    setIsProcessingSelection(true)

    try {
      const results = await Promise.allSettled(
        targetClients.map((client) =>
          handleDeleteClientFlow({ clientId: normalizeId(client.id), deleteClient }),
        ),
      )

      const successCount = results.filter((result) => result.status === 'fulfilled').length
      const failureCount = results.length - successCount
      const firstError = results.find((result) => result.status === 'rejected')?.reason

      buildBulkSummaryToast({
        title: 'Eliminación masiva',
        action: 'Cliente eliminado',
        successCount,
        failureCount,
        total: results.length,
        errorMessage: resolveApiErrorMessage(
          firstError,
          'No se pudieron eliminar los clientes seleccionados.',
        ),
      })

      if (failureCount === results.length && firstError) {
        throw firstError
      }
    } finally {
      setIsProcessingSelection(false)
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

  const handleImportSubmit = async (file) => {
    setIsImporting(true)
    try {
      const summary = await importClients(file)
      setImportSummary(summary)
      showToast({
        type: 'success',
        title: 'Importación completada',
        description: 'Se procesó el archivo de clientes.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo importar',
        description: resolveApiErrorMessage(error, 'Revisa el archivo e inténtalo nuevamente.'),
      })
    } finally {
      setIsImporting(false)
    }
  }

  const handleCloseImport = () => {
    if (isImporting) return
    setIsImportModalOpen(false)
    setImportSummary(null)
  }

  if (initializeStatus?.isLoading || isRefreshing) {
    return <ClientsSkeleton />
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap gap-2 pt-6" role="tablist">
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.id}
              id={`main-tab-${tab.id}`}
              role="tab"
              aria-selected={activeMainTab === tab.id}
              aria-controls={`main-panel-${tab.id}`}
              className={`rounded px-4 py-2 text-sm font-medium ${
                activeMainTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200'
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}
              onClick={() => setActiveMainTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </CardContent>
      </Card>

      {activeMainTab === 'services' ? (
        <div id="main-panel-services" role="tabpanel" aria-labelledby="main-tab-services">
          <MonthlyServicesPage />
        </div>
      ) : (
        <div
          id="main-panel-clients"
          role="tabpanel"
          aria-labelledby="main-tab-clients"
          className="space-y-4"
        >
          <Card aria-label="Opciones de clientes">
            <CardContent className="flex flex-wrap gap-2 pt-6" role="tablist">
              {CLIENT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  id={`client-tab-${tab.id}`}
                  role="tab"
                  aria-selected={activeClientTab === tab.id}
                  aria-controls={`client-panel-${tab.id}`}
                  className={`rounded px-4 py-2 text-sm font-medium ${
                    activeClientTab === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}
                  onClick={() => setActiveClientTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </CardContent>
          </Card>

          {activeClientTab === 'list' && (
            <div id="client-panel-list" role="tabpanel" aria-labelledby="client-tab-list" className="space-y-4">
              <ClientsList
                clients={clients}
                status={clientsStatus}
                onReload={reloadClients}
                onSelectClient={handleSelectClient}
                selectedClientId={selectedClientId}
                selectedClientIds={selectedClientIds}
                onSelectionChange={setSelectedClientIds}
                onDeleteClient={handleDeleteClient}
                servicePlans={servicePlans}
                isProcessing={isProcessingService || clientsStatus?.isMutating}
                onBulkAssignPlan={handleBulkAssignPlan}
                onBulkChangeStatus={handleBulkServiceStatus}
                onBulkDeleteClients={handleBulkDeleteClients}
                isProcessingSelection={isProcessingSelection}
                onOpenImport={() => setIsImportModalOpen(true)}
              />
            </div>
          )}

          {activeClientTab === 'create' && (
            <div
              id="client-panel-create"
              role="tabpanel"
              aria-labelledby="client-tab-create"
              className="space-y-4"
            >
              <div className="mx-auto max-w-4xl">
                <ClientForm
                  servicePlans={servicePlans}
                  onSubmit={handleCreateClient}
                  isSubmitting={isSubmitting}
                />
              </div>
            </div>
          )}

          {activeClientTab === 'payments' && (
            <div
              id="client-panel-payments"
              role="tabpanel"
              aria-labelledby="client-tab-payments"
              className="space-y-4"
            >
              <Card>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-sm font-medium" htmlFor="client-selector">
                      Selecciona un cliente para ver adeudos y pagos
                    </label>
                    <select
                      id="client-selector"
                      className="mt-1 w-full rounded border border-slate-200 p-2"
                      value={normalizeId(selectedClientId) ?? ''}
                      onChange={(event) => handleSelectClient(event.target.value)}
                    >
                      <option value="">Elige un cliente</option>
                      {clients.map((client) => (
                        <option key={client.id} value={normalizeId(client.id)}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-sm text-slate-600">
                    Usa las flechas de tabulación para cambiar entre pestañas y controles. La lista conserva tu
                    selección.
                  </p>
                </CardContent>
              </Card>

              {selectedClient ? (
                <>
                  <ClientDetailTabs client={selectedClient} initialTab="payments" />
                  <ServicesAssignments
                    client={selectedClient}
                    servicePlans={servicePlans}
                    onAssign={handleAssignService}
                    onChangeStatus={handleUpdateServiceStatus}
                    onUpdateService={handleUpdateServiceMetadata}
                    onDeleteService={handleDeleteService}
                    isProcessing={isProcessingService || servicePlansStatus?.isLoading}
                  />
                </>
              ) : (
                <Card>
                  <CardContent>
                    <p className="text-sm text-slate-600">
                      Selecciona un cliente para revisar su historial de pagos y administrar adeudos.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
      <ImportClientsModal
        isOpen={isImportModalOpen}
        onClose={handleCloseImport}
        onSubmit={handleImportSubmit}
        isProcessing={isImporting}
        summary={importSummary}
        requiresConfirmation={Boolean(importSummary && importSummary.failed_count > 0)}
        onConfirmSummary={handleCloseImport}
      />
    </div>
  )
}
