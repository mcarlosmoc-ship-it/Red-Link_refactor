import React, { useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import { getPrimaryService, normalizeId } from './utils.js'

const LOCATION_FILTER_NONE = '__none__'

const filtersInitialState = {
  term: '',
  location: 'all',
  status: 'all',
}

export default function ClientsList({
  clients,
  status,
  onReload,
  onSelectClient,
  selectedClientId,
  onDeleteClient,
  onBulkAssignServices,
  onBulkChangeServiceStatus,
  onBulkDeleteServices,
  servicePlans = [],
  isProcessing = false,
}) {
  const [filters, setFilters] = useState(filtersInitialState)
  const [selectedClientIds, setSelectedClientIds] = useState([])
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [isBulkActionRunning, setIsBulkActionRunning] = useState(false)

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
    setSelectedClientIds((prev) =>
      prev.filter((id) => filteredClients.some((client) => normalizeId(client.id) === id)),
    )
  }, [filteredClients])

  const hasSelection = selectedClientIds.length > 0
  const allFilteredSelected =
    filteredClients.length > 0 &&
    filteredClients.every((client) => selectedClientIds.includes(normalizeId(client.id)))

  const handleChangeFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const toggleClientSelection = (clientId) => {
    const normalizedId = normalizeId(clientId)
    if (!normalizedId) return

    setSelectedClientIds((prev) =>
      prev.includes(normalizedId)
        ? prev.filter((id) => id !== normalizedId)
        : [...prev, normalizedId],
    )
  }

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedClientIds((prev) =>
        prev.filter((id) => !filteredClients.some((client) => normalizeId(client.id) === id)),
      )
      return
    }
    const allIds = filteredClients.map((client) => normalizeId(client.id)).filter(Boolean)
    setSelectedClientIds((prev) => Array.from(new Set([...prev, ...allIds])))
  }

  const runBulkAction = async (fn) => {
    if (!fn || !hasSelection) return
    setIsBulkActionRunning(true)
    try {
      await fn()
      setSelectedClientIds([])
    } catch (error) {
      // la retroalimentación se maneja en el nivel superior
    } finally {
      setIsBulkActionRunning(false)
    }
  }

  const handleBulkAssign = () => {
    if (!onBulkAssignServices || !selectedPlanId) return
    return runBulkAction(() => onBulkAssignServices({ clientIds: selectedClientIds, servicePlanId: selectedPlanId }))
  }

  const handleBulkChangeStatus = (nextStatus) => {
    if (!onBulkChangeServiceStatus) return
    return runBulkAction(() => onBulkChangeServiceStatus({ clientIds: selectedClientIds, status: nextStatus }))
  }

  const handleBulkDelete = () => {
    if (!onBulkDeleteServices) return
    return runBulkAction(() => onBulkDeleteServices(selectedClientIds))
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

  const isBulkDisabled =
    isLoading || isMutating || isProcessing || isBulkActionRunning || filteredClients.length === 0 || !hasSelection

  return (
    <Card data-testid="clients-list">
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <CardTitle>Listado de clientes</CardTitle>
        <div className="flex items-center gap-2">
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

        <div className="space-y-3 rounded border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                disabled={isLoading || isMutating || isProcessing || filteredClients.length === 0}
              />
              <span>
                Seleccionar clientes visibles ({selectedClientIds.length}/{filteredClients.length})
              </span>
            </label>
            <span className="text-xs text-slate-500">
              Usa los filtros y la búsqueda para delimitar el lote.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedPlanId}
              onChange={(event) => setSelectedPlanId(event.target.value)}
              className="min-w-[180px] rounded border border-slate-200 p-2 text-sm"
              disabled={isBulkDisabled}
            >
              <option value="">Selecciona plan</option>
              {servicePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleBulkAssign}
              disabled={isBulkDisabled || !selectedPlanId}
            >
              Asignar plan
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkChangeStatus('suspended')} disabled={isBulkDisabled}>
              Suspender servicios
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkChangeStatus('active')} disabled={isBulkDisabled}>
              Activar servicios
            </Button>
            <Button size="sm" variant="danger" onClick={handleBulkDelete} disabled={isBulkDisabled}>
              Eliminar servicios
            </Button>
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
                    className="h-4 w-4 rounded border-slate-300"
                    checked={allFilteredSelected && filteredClients.length > 0}
                    onChange={toggleSelectAll}
                    disabled={isLoading || isMutating || isProcessing || filteredClients.length === 0}
                    aria-label="Seleccionar todos los clientes visibles"
                  />
                </th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Ubicación</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => {
                const id = normalizeId(client.id)
                const isSelected = id && id === selectedClientId
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
                        className="h-4 w-4 rounded border-slate-300"
                        checked={selectedClientIds.includes(id)}
                        onChange={() => toggleClientSelection(id)}
                        aria-label={`Seleccionar cliente ${client.name}`}
                        disabled={isLoading || isMutating || isProcessing}
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
              {filteredClients.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={5}>
                    No se encontraron clientes con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
