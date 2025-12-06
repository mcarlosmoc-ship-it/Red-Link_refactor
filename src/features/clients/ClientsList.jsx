import React, { useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import { getPrimaryService, normalizeId } from './utils.js'

const SelectionActionReport = ({ report, onClear }) => {
  if (!report || !Array.isArray(report.results) || report.results.length === 0) {
    return null
  }

  const successCount = report.results.filter((item) => item.status === 'success').length
  const failureCount = report.results.filter((item) => item.status === 'error').length

  return (
    <div className="space-y-2 rounded border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{report.title ?? 'Resumen de acciones masivas'}</p>
          <p className="text-xs text-slate-600">
            {successCount > 0 && `${successCount} completadas`} {failureCount > 0 && `· ${failureCount} con error`}
          </p>
        </div>
        {typeof onClear === 'function' && (
          <Button size="sm" variant="ghost" onClick={onClear} disabled={report.isLocked}>
            Limpiar
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {report.results.map((item) => (
          <div key={`${item.clientId}-${item.status}-${item.message}`} className="flex gap-2 text-sm">
            <span
              className={`mt-1 h-2 w-2 rounded-full ${
                item.status === 'success' ? 'bg-green-500' : 'bg-red-500'
              }`}
              aria-hidden
            />
            <div>
              <p className="font-medium text-slate-800">{item.clientName ?? `Cliente ${item.clientId}`}</p>
              <p className="text-slate-600">{item.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const LOCATION_FILTER_NONE = '__none__'
const PAGE_SIZE = 10

const filtersInitialState = {
  term: '',
  location: 'all',
  status: 'all',
}

export default function ClientsList({
  clients,
  servicePlans = [],
  status,
  onReload,
  onSelectClient,
  selectedClientId,
  selectedClientIds: controlledSelectedIds,
  onSelectionChange,
  onDeleteClient,
  onBulkAssignPlan,
  onBulkChangeStatus,
  onBulkDeleteClients,
  onOpenImport,
  isProcessing = false,
  isProcessingSelection = false,
  selectionActionReport,
  onClearSelectionReport,
}) {
  const [filters, setFilters] = useState(filtersInitialState)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [isRunningSelectionAction, setIsRunningSelectionAction] = useState(false)

  const [internalSelection, setInternalSelection] = useState(controlledSelectedIds ?? [])

  const selectedClientIds = controlledSelectedIds ?? internalSelection

  const updateSelection = (updater) => {
    const nextSelection = typeof updater === 'function' ? updater(selectedClientIds) : updater
    setInternalSelection(nextSelection)
    onSelectionChange?.(nextSelection)
  }

  useEffect(() => {
    if (Array.isArray(controlledSelectedIds)) {
      setInternalSelection(controlledSelectedIds)
    }
  }, [controlledSelectedIds])

  const availableLocations = useMemo(() => {
    const unique = new Set()
    clients.forEach((client) => {
      if (client.location) {
        unique.add(client.location)
      }
    })
    return Array.from(unique)
  }, [clients])

  const normalizedSearchTerm = filters.term.trim().toLowerCase()

  const availablePlans = useMemo(
    () => servicePlans.filter((plan) => (plan.serviceType ?? plan.category) !== 'token'),
    [servicePlans],
  )

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const searchValues = [client.name, client.location, client.zoneId]
      if (
        normalizedSearchTerm &&
        !searchValues.some((value) => value?.toString().toLowerCase().includes(normalizedSearchTerm))
      ) {
        return false
      }

      if (filters.location === LOCATION_FILTER_NONE && client.location) {
        return false
      }
      if (filters.location !== 'all' && filters.location !== LOCATION_FILTER_NONE) {
        return client.location === filters.location
      }

      if (filters.status === 'debt') {
        return (client.debtMonths ?? 0) > 0
      }
      if (filters.status === 'ok') {
        return (client.debtMonths ?? 0) === 0
      }

      return true
    })
  }, [clients, filters.location, filters.status, normalizedSearchTerm])

  useEffect(() => {
    updateSelection((prev) =>
      prev.filter((id) => filteredClients.some((client) => normalizeId(client.id) === id)),
    )
  }, [filteredClients])

  useEffect(() => {
    setCurrentPage(1)
    updateSelection([])
  }, [filters.location, filters.status, filters.term])

  useEffect(() => {
    updateSelection([])
  }, [currentPage])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE)),
    [filteredClients.length],
  )

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredClients.slice(start, start + PAGE_SIZE)
  }, [currentPage, filteredClients])

  const currentPageClientIds = useMemo(
    () => paginatedClients.map((client) => normalizeId(client.id)).filter(Boolean),
    [paginatedClients],
  )

  const isAllPageSelected =
    currentPageClientIds.length > 0 && currentPageClientIds.every((id) => selectedClientIds.includes(id))

  const selectedClientsOnPage = useMemo(
    () => selectedClientIds.filter((id) => currentPageClientIds.includes(id)).length,
    [currentPageClientIds, selectedClientIds],
  )

  const handleChangeFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const toggleSelection = (targetIds, checked) => {
    updateSelection((prev) => {
      const ids = targetIds.map((id) => normalizeId(id)).filter(Boolean)
      if (ids.length === 0) return prev

      const nextSelection = new Set(prev)

      if (checked === true) {
        ids.forEach((id) => nextSelection.add(id))
      } else if (checked === false) {
        ids.forEach((id) => nextSelection.delete(id))
      } else {
        ids.forEach((id) => {
          if (nextSelection.has(id)) {
            nextSelection.delete(id)
          } else {
            nextSelection.add(id)
          }
        })
      }

      return Array.from(nextSelection)
    })
  }

  const runBulkAction = async (actionCallback, { resetPlan = false } = {}) => {
    if (!actionCallback || selectedClientIds.length === 0) return

    setIsRunningSelectionAction(true)
    try {
      await actionCallback(selectedClientIds)
    } finally {
      if (resetPlan) {
        setSelectedPlanId('')
      }
      updateSelection([])
      setIsRunningSelectionAction(false)
    }
  }

  const handleBulkAssignPlan = async () => {
    if (!selectedPlanId || !onBulkAssignPlan) return

    await runBulkAction(
      (clientIds) =>
        onBulkAssignPlan({
          clientIds,
          servicePlanId: selectedPlanId,
        }),
      { resetPlan: true },
    )
  }

  const handleBulkStatusChange = async (nextStatus) => {
    if (!onBulkChangeStatus) return

    await runBulkAction((clientIds) => onBulkChangeStatus(clientIds, nextStatus))
  }

  const handleBulkDelete = async () => {
    if (!onBulkDeleteClients) return

    await runBulkAction((clientIds) => onBulkDeleteClients(clientIds))
  }

  const isLoading = Boolean(status?.isLoading)
  const isMutating = Boolean(status?.isMutating)
  const hasError = Boolean(status?.error)
  const isDirty = useMemo(
    () =>
      filters.term !== filtersInitialState.term ||
      filters.location !== filtersInitialState.location ||
      filters.status !== filtersInitialState.status,
    [filters.location, filters.status, filters.term],
  )

  const isSelectionActionRunning = isProcessingSelection || isRunningSelectionAction
  const isSelectionLocked =
    isSelectionActionRunning || isLoading || isMutating || isProcessing
  const isSelectionDisabled =
    isSelectionLocked || selectedClientIds.length === 0

  return (
    <Card data-testid="clients-list">
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <CardTitle>Listado de clientes</CardTitle>
        <div className="flex items-center gap-2">
          {typeof onOpenImport === 'function' && (
            <Button variant="ghost" onClick={onOpenImport} data-testid="import-clients">
              Importar CSV
            </Button>
          )}
          <Button disabled={isLoading} onClick={() => onReload?.()}>
            Recargar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            aria-label="Buscar clientes"
            data-testid="search-clients"
            className="rounded border border-slate-200 p-2"
            placeholder="Buscar por nombre o zona"
            value={filters.term}
            onChange={(event) => handleChangeFilter('term', event.target.value)}
          />
          <select
            aria-label="Filtro ubicación"
            data-testid="location-filter"
            className="rounded border border-slate-200 p-2"
            value={filters.location}
            onChange={(event) => handleChangeFilter('location', event.target.value)}
          >
            <option value="all">Todas las ubicaciones</option>
            <option value={LOCATION_FILTER_NONE}>Sin ubicación</option>
            {availableLocations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtro estado"
            data-testid="status-filter"
            className="rounded border border-slate-200 p-2"
            value={filters.status}
            onChange={(event) => handleChangeFilter('status', event.target.value)}
          >
            <option value="all">Todos</option>
            <option value="ok">Al corriente</option>
            <option value="debt">Con adeudo</option>
          </select>
          <Button variant="ghost" disabled={!isDirty} onClick={() => setFilters(filtersInitialState)}>
            Limpiar filtros
          </Button>
        </div>

        <div className="flex flex-col gap-2 rounded border border-slate-200 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-700">
              {selectedClientsOnPage} seleccionados / {currentPageClientIds.length} visibles (página{' '}
              {currentPage} de {totalPages})
            </p>
            <p
              className="text-xs text-slate-500"
              title="Funciona como Wisphub: selecciona clientes en la página visible y aplica acciones masivas desde esta barra."
            >
              Selección por página + barra de acciones (modo Wisphub)
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                className="rounded border border-slate-200 p-2"
                data-testid="bulk-plan"
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
                disabled={isSelectionLocked}
              >
                <option value="">Asignar plan...</option>
                {availablePlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="ghost"
                disabled={isSelectionDisabled || !selectedPlanId}
                onClick={handleBulkAssignPlan}
                data-testid="bulk-assign"
              >
                Asignar plan
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isSelectionDisabled}
                onClick={() => handleBulkStatusChange('suspended')}
                data-testid="bulk-suspend"
              >
                Suspender
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isSelectionDisabled}
                onClick={() => handleBulkStatusChange('active')}
                data-testid="bulk-activate"
              >
                Activar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isSelectionDisabled}
                onClick={handleBulkDelete}
                data-testid="bulk-delete"
              >
                Eliminar
              </Button>
            </div>
          </div>
          <SelectionActionReport report={selectionActionReport} onClear={onClearSelectionReport} />
        </div>

        {hasError && <p className="text-sm text-red-600">Ocurrió un error al cargar los clientes.</p>}
        {isLoading && <p className="text-sm text-slate-500">Cargando clientes...</p>}

        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={isAllPageSelected}
                    onChange={(event) => toggleSelection(currentPageClientIds, event.target.checked)}
                    disabled={isSelectionLocked || paginatedClients.length === 0}
                    aria-label="Seleccionar todos"
                  />
                </th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Ubicación</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginatedClients.map((client) => {
                const id = normalizeId(client.id)
                const isSelected = id && id === selectedClientId
                const isChecked = id ? selectedClientIds.includes(id) : false
                const primaryService = getPrimaryService(client)
                const servicesWithDebt = Array.isArray(client.services)
                  ? client.services.filter(
                      (service) => Number(service.debtMonths ?? 0) > 0 || Number(service.debtAmount ?? 0) > 0,
                    )
                  : []
                return (
                  <tr
                    key={id}
                    className={`border-b border-slate-100 ${isSelected ? 'bg-blue-50' : ''}`}
                    data-testid={`client-row-${id}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={isChecked}
                        onChange={() => toggleSelection([id])}
                        aria-label={`Seleccionar cliente ${client.name}`}
                        disabled={isSelectionLocked}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{client.name}</td>
                    <td className="px-3 py-2">{client.location || 'Sin ubicación'}</td>
                    <td className="px-3 py-2">
                      {primaryService?.status === 'suspended' ? 'Suspendido' : 'Activo'}
                      {servicesWithDebt.length > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          Adeudo
                          {servicesWithDebt.length > 1 && `(${servicesWithDebt.length})`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`select-${id}`}
                          onClick={() => onSelectClient?.(id)}
                        >
                          Ver detalles
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onDeleteClient?.(id)}
                          data-testid={`delete-${id}`}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {paginatedClients.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={5}>
                    No se encontraron clientes con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-600">
            Página {currentPage} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
