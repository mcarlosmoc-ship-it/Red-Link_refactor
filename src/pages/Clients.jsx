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
  const { deleteClientService } = useClientServices({ autoLoad: false })
  const { servicePlans, status: servicePlansStatus } = useServicePlans()
  const { showToast } = useToast()
  const [activeMainTab, setActiveMainTab] = useState('clients')
  const [selectedClientId, setSelectedClientId] = useState(null)
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

  const resolveSelectedClients = (selectedIds) =>
    clients.filter((client) => selectedIds.includes(normalizeId(client.id)))

  const handleBulkAssignPlan = async ({ clientIds, servicePlanId }) => {
    if (!clientIds?.length || !servicePlanId) return
    const targetClients = resolveSelectedClients(clientIds)
    if (targetClients.length === 0) return

    setIsProcessingSelection(true)
    const payloadIds = targetClients.map((client) => client.id)
    const selectedPlan = servicePlans.find((plan) => normalizeId(plan.id) === normalizeId(servicePlanId))

    try {
      await bulkAssignClientServices({ clientIds: payloadIds, servicePlanId })
      showToast({
        type: 'success',
        title: 'Plan asignado',
        description: `Se asignó ${selectedPlan?.name ?? 'el plan seleccionado'} a ${payloadIds.length} clientes.`,
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
    if (!clientIds?.length || !nextStatus) return
    const targetClients = resolveSelectedClients(clientIds)
    if (targetClients.length === 0) return

    setIsProcessingSelection(true)

    try {
      const results = await Promise.allSettled(
        targetClients.map((client) => {
          const primaryService = getPrimaryService(client)
          if (!primaryService?.id) {
            return Promise.reject(new Error('El cliente no tiene servicios asociados'))
          }
          return updateClientServiceStatus(client.id, primaryService.id, nextStatus)
        }),
      )

      const successCount = results.filter((result) => result.status === 'fulfilled').length
      const errors = results.filter((result) => result.status === 'rejected')

      if (successCount > 0) {
        showToast({
          type: 'success',
          title: nextStatus === 'active' ? 'Clientes activados' : 'Clientes suspendidos',
          description: `${successCount} clientes fueron actualizados correctamente.`,
        })
      }

      if (errors.length > 0) {
        const firstError = errors[0].reason
        showToast({
          type: 'error',
          title: 'Algunos clientes no pudieron actualizarse',
          description: resolveApiErrorMessage(firstError, 'Revisa que tengan servicios disponibles.'),
        })
        if (successCount === 0) {
          throw firstError
        }
      }
    } finally {
      setIsProcessingSelection(false)
    }
  }

  const handleBulkDeleteClients = async (clientIds) => {
    if (!clientIds?.length) return
    const targetClients = resolveSelectedClients(clientIds)
    if (targetClients.length === 0) return

    setIsProcessingSelection(true)

    try {
      const results = await Promise.allSettled(
        targetClients.map((client) =>
          handleDeleteClientFlow({ clientId: normalizeId(client.id), deleteClient }),
        ),
      )

      const successCount = results.filter((result) => result.status === 'fulfilled').length
      const errors = results.filter((result) => result.status === 'rejected')

      if (successCount > 0) {
        showToast({
          type: 'success',
          title: 'Clientes eliminados',
          description: `${successCount} clientes fueron eliminados.`,
        })
      }

      if (errors.length > 0) {
        const firstError = errors[0].reason
        showToast({
          type: 'error',
          title: 'Algunos clientes no se eliminaron',
          description: resolveApiErrorMessage(firstError),
        })
        if (successCount === 0) {
          throw firstError
        }
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
              servicePlans={servicePlans}
              status={clientsStatus}
              onReload={reloadClients}
              onSelectClient={setSelectedClientId}
              selectedClientId={selectedClientId}
              onDeleteClient={handleDeleteClient}
              onBulkAssignPlan={handleBulkAssignPlan}
              onBulkChangeStatus={handleBulkServiceStatus}
              onBulkDeleteClients={handleBulkDeleteClients}
              isProcessingSelection={isProcessingSelection}
              onOpenImport={() => setIsImportModalOpen(true)}
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
