import React, { useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import { getPrimaryService, normalizeId } from './utils.js'

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
  onDeleteClient,
  onBulkAssignPlan,
  onBulkChangeStatus,
  onBulkDeleteClients,
  isProcessingSelection = false,
  onOpenImport,
}) {
  const [filters, setFilters] = useState(filtersInitialState)
  const [selectedClientIds, setSelectedClientIds] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedPlanId, setSelectedPlanId] = useState('')

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

  const handleChangeFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    setCurrentPage(1)
    setSelectedClientIds([])
  }, [filters.location, filters.status, filters.term])

  useEffect(() => {
    setSelectedClientIds([])
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

  const toggleClientSelection = (clientId) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    )
  }

  const currentPageClientIds = useMemo(
    () => paginatedClients.map((client) => normalizeId(client.id)).filter(Boolean),
    [paginatedClients],
  )

  const isAllPageSelected =
    currentPageClientIds.length > 0 && currentPageClientIds.every((id) => selectedClientIds.includes(id))

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedClientIds((prev) => Array.from(new Set([...prev, ...currentPageClientIds])))
      return
    }
    setSelectedClientIds((prev) => prev.filter((id) => !currentPageClientIds.includes(id)))
  }

  const runSelectionAction = async (action) => {
    if (!action || selectedClientIds.length === 0) return
    try {
      await action()
    } catch (error) {
      // el contenedor de acciones maneja los mensajes de error
      throw error
    }
  }

  const handleBulkAssignPlan = async () => {
    if (!selectedPlanId || !onBulkAssignPlan) return
    try {
      await runSelectionAction(() => onBulkAssignPlan({
        clientIds: selectedClientIds,
        servicePlanId: selectedPlanId,
      }))
      setSelectedPlanId('')
      setSelectedClientIds([])
    } catch (error) {
      // el manejador padre muestra el error
    }
  }

  const handleBulkStatusChange = async (status) => {
    if (!onBulkChangeStatus) return
    try {
      await runSelectionAction(() => onBulkChangeStatus(selectedClientIds, status))
      setSelectedClientIds([])
    } catch (error) {
      // el manejador padre muestra el error
    }
  }

  const handleBulkDelete = async () => {
    if (!onBulkDeleteClients) return
    try {
      await runSelectionAction(() => onBulkDeleteClients(selectedClientIds))
      setSelectedClientIds([])
    } catch (error) {
      // el manejador padre muestra el error
    }
  }

  const isLoading = Boolean(status?.isLoading)
  const hasError = Boolean(status?.error)
  const isDirty = useMemo(
    () =>
      filters.term !== filtersInitialState.term ||
      filters.location !== filtersInitialState.location ||
      filters.status !== filtersInitialState.status,
    [filters.location, filters.status, filters.term],
  )

  const isSelectionDisabled =
    isProcessingSelection || isLoading || Boolean(status?.isMutating) || selectedClientIds.length === 0

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
          <Button disabled={isLoading} onClick={() => onReload?.()}>Recargar</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
              {selectedClientIds.length} clientes seleccionados (página {currentPage} de {totalPages})
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                className="rounded border border-slate-200 p-2"
                data-testid="bulk-plan"
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
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
        </div>

        {hasError && <p className="text-sm text-red-600">Ocurrió un error al cargar los clientes.</p>}
        {isLoading && <p className="text-sm text-slate-500">Cargando clientes...</p>}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={isAllPageSelected}
                    onChange={(event) => toggleSelectAll(event.target.checked)}
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
                return (
                  <tr
                    key={id}
                    className={`border-b border-slate-100 ${isSelected ? 'bg-blue-50' : ''}`}
                    data-testid={`client-row-${id}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar cliente ${client.name}`}
                        checked={isChecked}
                        onChange={() => toggleClientSelection(id)}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{client.name}</td>
                    <td className="px-3 py-2">{client.location || 'Sin ubicación'}</td>
                    <td className="px-3 py-2">
                      {primaryService?.status === 'suspended' ? 'Suspendido' : 'Activo'}
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
