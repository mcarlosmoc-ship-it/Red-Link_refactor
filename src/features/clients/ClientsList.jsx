import React, { useMemo, useState } from 'react'
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
}) {
  const [filters, setFilters] = useState(filtersInitialState)

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

  const handleChangeFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
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

        {hasError && <p className="text-sm text-red-600">Ocurrió un error al cargar los clientes.</p>}
        {isLoading && <p className="text-sm text-slate-500">Cargando clientes...</p>}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
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
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={4}>
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
