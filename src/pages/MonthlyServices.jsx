import React, { useCallback, useMemo, useState } from 'react'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { useClientServices } from '../hooks/useClientServices.js'
import { useClients } from '../hooks/useClients.js'
import { useToast } from '../hooks/useToast.js'
import {
  SERVICE_TYPE_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  getServiceTypeLabel,
  getServiceStatusLabel,
} from '../constants/serviceTypes.js'
import { computeServiceFormErrors } from '../utils/serviceFormValidation.js'
import { peso, formatDate } from '../utils/formatters.js'

const normalizeId = (value) => {
  if (value === null || value === undefined) {
    return null
  }
  return String(value)
}

const statusStyles = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  suspended: 'border-amber-200 bg-amber-50 text-amber-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-600',
}

const SUB_TABS = [
  { id: 'list', label: 'Servicios disponibles' },
  { id: 'create', label: 'Agregar servicio mensual' },
]

const createDefaultServiceForm = () => ({
  clientId: '',
  serviceType: 'internet_private',
  displayName: getServiceTypeLabel('internet_private'),
  price: '',
  billingDay: '',
  baseId: '',
  status: 'active',
  notes: '',
})

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === '') {
    return '—'
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '—'
  }
  return peso(numeric)
}

export default function MonthlyServicesPage({ variant = 'page' }) {
  const {
    clientServices,
    status: servicesStatus,
    isLoading: isLoadingServices,
    isMutating: isMutatingServices,
    reload: reloadServices,
    createClientService,
    updateClientService,
    deleteClientService,
  } = useClientServices()
  const { clients, status: clientsStatus } = useClients()
  const { showToast } = useToast()

  const isEmbedded = variant === 'embedded'

  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('list')
  const [editingServiceId, setEditingServiceId] = useState(null)
  const [formState, setFormState] = useState(() => createDefaultServiceForm())
  const [formErrors, setFormErrors] = useState({})

  const clientsMap = useMemo(() => {
    return new Map(
      clients.map((client) => [normalizeId(client.id), { name: client.name, location: client.location }]),
    )
  }, [clients])

  const clientOptions = useMemo(() => {
    return clients
      .map((client) => ({ value: normalizeId(client.id), label: client.name }))
      .filter((option) => option.value)
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
  }, [clients])

  const servicesWithClient = useMemo(() => {
    return clientServices.map((service) => {
      const client = clientsMap.get(normalizeId(service.clientId)) ?? null
      return {
        ...service,
        clientName: client?.name ?? 'Cliente sin nombre',
        clientLocation: client?.location ?? '',
      }
    })
  }, [clientServices, clientsMap])

  const filteredServices = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return servicesWithClient.filter((service) => {
      if (typeFilter !== 'all' && service.type !== typeFilter) {
        return false
      }
      if (statusFilter !== 'all' && service.status !== statusFilter) {
        return false
      }
      if (!normalizedSearch) {
        return true
      }
      const haystack = [service.name, service.clientName, service.clientLocation]
        .filter(Boolean)
        .map((value) => value.toLowerCase())
      return haystack.some((value) => value.includes(normalizedSearch))
    })
  }, [servicesWithClient, typeFilter, statusFilter, searchTerm])

  const sortedServices = useMemo(() => {
    return [...filteredServices].sort((a, b) => {
      const clientCompare = a.clientName.localeCompare(b.clientName, 'es', { sensitivity: 'base' })
      if (clientCompare !== 0) {
        return clientCompare
      }
      return (a.name ?? '').localeCompare(b.name ?? '', 'es', { sensitivity: 'base' })
    })
  }, [filteredServices])

  const resetForm = useCallback(() => {
    setFormState(createDefaultServiceForm())
    setFormErrors({})
    setEditingServiceId(null)
  }, [])

  const handleSelectTab = useCallback(
    (tabId) => {
      if (tabId === 'list') {
        resetForm()
        setActiveTab('list')
        return
      }

      setActiveTab('create')
      if (!editingServiceId) {
        resetForm()
      }
    },
    [editingServiceId, resetForm],
  )

  const isEditing = Boolean(editingServiceId)
  const clientsAreLoading = Boolean(clientsStatus?.isLoading)
  const servicesAreMutating = Boolean(isMutatingServices)

  const validateForm = useCallback(() => {
    const errors = computeServiceFormErrors(formState, { requireClientId: !isEditing })
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }, [formState, isEditing])

  const handleEditService = useCallback(
    (service) => {
      if (!service) {
        return
      }
      setActiveTab('create')
      setEditingServiceId(service.id)
      setFormErrors({})
      setFormState({
        clientId: normalizeId(service.clientId) ?? '',
        serviceType: service.type,
        displayName: service.name ?? '',
        price:
          service.price === null || service.price === undefined || service.price === ''
            ? ''
            : String(service.price),
        billingDay: service.billingDay ?? '',
        baseId:
          service.baseId === null || service.baseId === undefined || service.baseId === ''
            ? ''
            : String(service.baseId),
        status: service.status ?? 'active',
        notes: service.notes ?? '',
      })
    },
    [],
  )

  const handleDeleteService = useCallback(
    async (service) => {
      if (!service) {
        return
      }
      const confirmed = window.confirm(`¿Eliminar ${service.name} de ${service.clientName}?`)
      if (!confirmed) {
        return
      }
      try {
        await deleteClientService(service.id)
        showToast({
          type: 'success',
          title: 'Servicio eliminado',
          description: `${service.name} se eliminó correctamente.`,
        })
      } catch (error) {
        showToast({
          type: 'error',
          title: 'No se pudo eliminar el servicio',
          description: error?.message ?? 'Intenta nuevamente.',
        })
      }
    },
    [deleteClientService, showToast],
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validateForm()) {
      return
    }

    const trimmedName = formState.displayName.trim()
    const normalizedPrice =
      formState.price === '' || formState.price === null ? undefined : Number(formState.price)
    const normalizedBillingDay =
      formState.billingDay === '' || formState.billingDay === null
        ? undefined
        : Number(formState.billingDay)
    const normalizedBaseId =
      formState.baseId === '' || formState.baseId === null ? undefined : Number(formState.baseId)
    const trimmedNotes = formState.notes?.trim() ? formState.notes.trim() : null

    try {
      if (isEditing && editingServiceId) {
        await updateClientService(editingServiceId, {
          displayName: trimmedName,
          price: normalizedPrice,
          billingDay: normalizedBillingDay,
          baseId: normalizedBaseId,
          status: formState.status,
          notes: trimmedNotes,
        })
        showToast({
          type: 'success',
          title: 'Servicio actualizado',
          description: `${trimmedName || 'Servicio'} se actualizó correctamente.`,
        })
      } else {
        await createClientService({
          clientId: formState.clientId,
          serviceType: formState.serviceType,
          displayName: trimmedName || getServiceTypeLabel(formState.serviceType),
          price: normalizedPrice,
          billingDay: normalizedBillingDay,
          baseId: normalizedBaseId,
          status: formState.status,
          notes: trimmedNotes,
        })
        showToast({
          type: 'success',
          title: 'Servicio registrado',
          description: `${trimmedName || getServiceTypeLabel(formState.serviceType)} se creó correctamente.`,
        })
      }
      resetForm()
      setActiveTab('list')
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo guardar el servicio',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    }
  }

  const editingClientName = useMemo(() => {
    if (!isEditing) {
      return ''
    }
    const client = clientsMap.get(formState.clientId)
    return client?.name ?? 'Cliente'
  }, [clientsMap, formState.clientId, isEditing])

  const headingId = isEmbedded ? 'services-heading-embedded' : 'services-heading'

  return (
    <section aria-labelledby={headingId} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 id={headingId} className="text-lg font-semibold text-slate-900">
            Servicios mensuales
          </h2>
          <p className="text-sm text-slate-600">
            {isEmbedded
              ? 'Consulta, agrega y modifica planes mensuales sin salir del panel de clientes.'
              : 'Administra los servicios contratados por tus clientes, ajusta precios y controla su estado.'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
          onClick={() => reloadServices().catch(() => {})}
          disabled={isLoadingServices || servicesAreMutating}
        >
          Actualizar listado
        </Button>
      </div>

      {servicesStatus?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {servicesStatus.error}
        </div>
      )}

      <Card>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1">
              {SUB_TABS.map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleSelectTab(tab.id)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                      isActive ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'
                    }`}
                    aria-pressed={isActive}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
            {isEditing && activeTab === 'create' ? (
              <span className="text-xs font-medium text-slate-600">
                Editando servicio de {editingClientName}
              </span>
            ) : null}
          </div>

          {activeTab === 'create' ? (
            <form
              onSubmit={handleSubmit}
              className="grid gap-4 rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm"
            >
              {!isEditing ? (
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span>Cliente</span>
                  <select
                    value={formState.clientId}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, clientId: event.target.value }))
                    }
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                      formErrors.clientId
                        ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                        : 'border-slate-300'
                    }`}
                    disabled={clientsAreLoading}
                  >
                    <option value="">Selecciona un cliente</option>
                    {clientOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {formErrors.clientId && (
                    <span className="text-xs font-medium text-red-600">{formErrors.clientId}</span>
                  )}
                </label>
              ) : (
                <div className="text-xs">
                  <p className="font-semibold text-slate-700">Cliente</p>
                  <p className="text-slate-600">{editingClientName}</p>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span>Tipo de servicio</span>
                  <select
                    value={formState.serviceType}
                    onChange={(event) => {
                      const nextType = event.target.value
                      setFormState((prev) => {
                        const currentName = prev.displayName?.trim() ?? ''
                        const previousDefault = getServiceTypeLabel(prev.serviceType)
                        const nextDefault = getServiceTypeLabel(nextType)
                        const hasCustomName = currentName && currentName !== previousDefault
                        return {
                          ...prev,
                          serviceType: nextType,
                          displayName: hasCustomName ? prev.displayName : nextDefault,
                        }
                      })
                    }}
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                      formErrors.serviceType
                        ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                        : 'border-slate-300'
                    }`}
                    disabled={isEditing}
                  >
                    {SERVICE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {formErrors.serviceType && (
                    <span className="text-xs font-medium text-red-600">{formErrors.serviceType}</span>
                  )}
                </label>

                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span>Nombre del servicio</span>
                  <input
                    value={formState.displayName}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, displayName: event.target.value }))
                    }
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                      formErrors.displayName
                        ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                        : 'border-slate-300'
                    }`}
                  />
                  {formErrors.displayName && (
                    <span className="text-xs font-medium text-red-600">{formErrors.displayName}</span>
                  )}
                </label>

                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span>Estado</span>
                  <select
                    value={formState.status}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, status: event.target.value }))
                    }
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                      formErrors.status
                        ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                        : 'border-slate-300'
                    }`}
                  >
                    {SERVICE_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {formErrors.status && (
                    <span className="text-xs font-medium text-red-600">{formErrors.status}</span>
                  )}
                </label>

                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span>Tarifa mensual (MXN)</span>
                  <input
                    value={formState.price}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, price: event.target.value }))
                    }
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                      formErrors.price
                        ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                        : 'border-slate-300'
                    }`}
                  />
                  {formErrors.price && (
                    <span className="text-xs font-medium text-red-600">{formErrors.price}</span>
                  )}
                </label>

                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span>Día de cobro</span>
                  <input
                    value={formState.billingDay}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, billingDay: event.target.value }))
                    }
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="31"
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                      formErrors.billingDay
                        ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                        : 'border-slate-300'
                    }`}
                  />
                  {formErrors.billingDay && (
                    <span className="text-xs font-medium text-red-600">{formErrors.billingDay}</span>
                  )}
                </label>

                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span>Base</span>
                  <select
                    value={formState.baseId}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, baseId: event.target.value }))
                    }
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                      formErrors.baseId
                        ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                        : 'border-slate-300'
                    }`}
                  >
                    <option value="">Sin base específica</option>
                    <option value="1">Base 1</option>
                    <option value="2">Base 2</option>
                  </select>
                  {formErrors.baseId && (
                    <span className="text-xs font-medium text-red-600">{formErrors.baseId}</span>
                  )}
                </label>
              </div>

              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span>Notas</span>
                <textarea
                  value={formState.notes}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  rows={3}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                  placeholder="Ej. Incluye mantenimiento trimestral"
                />
              </label>

              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
                  onClick={resetForm}
                >
                  Limpiar
                </Button>
                <Button type="submit" disabled={servicesAreMutating}>
                  {isEditing ? 'Guardar cambios' : 'Guardar servicio'}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Buscar
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    type="search"
                    placeholder="Servicio o cliente"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Tipo de servicio
                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="all">Todos</option>
                    {SERVICE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Estado
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="all">Todos</option>
                    {SERVICE_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {isLoadingServices && (
                <div
                  className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700"
                  role="status"
                >
                  Cargando servicios…
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Servicio</th>
                      <th className="px-4 py-3 text-left">Cliente</th>
                      <th className="px-4 py-3 text-left">Tipo</th>
                      <th className="px-4 py-3 text-left">Tarifa</th>
                      <th className="px-4 py-3 text-left">Día de cobro</th>
                      <th className="px-4 py-3 text-left">Estado</th>
                      <th className="px-4 py-3 text-left">Actualizado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {sortedServices.length === 0 && !isLoadingServices ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                          No hay servicios que coincidan con los filtros seleccionados.{' '}
                          <button
                            type="button"
                            onClick={() => handleSelectTab('create')}
                            className="font-semibold text-blue-600 hover:underline"
                          >
                            Crea un nuevo servicio mensual
                          </button>
                          .
                        </td>
                      </tr>
                    ) : (
                      sortedServices.map((service) => {
                        const statusClass = statusStyles[service.status] ?? statusStyles.cancelled
                        return (
                          <tr key={service.id} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-800">
                                {service.name || getServiceTypeLabel(service.type)}
                              </div>
                              <div className="text-xs text-slate-500">{formatCurrency(service.price)}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-800">{service.clientName}</div>
                              {service.clientLocation && (
                                <div className="text-xs text-slate-500">{service.clientLocation}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{getServiceTypeLabel(service.type)}</td>
                            <td className="px-4 py-3">{formatCurrency(service.price)}</td>
                            <td className="px-4 py-3">{service.billingDay ? `Día ${service.billingDay}` : '—'}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass}`}
                              >
                                {getServiceStatusLabel(service.status)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {service.updatedAt ? formatDate(service.updatedAt) : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
                                  onClick={() => handleEditService(service)}
                                >
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="border border-red-200 bg-white text-red-600 hover:border-red-300"
                                  onClick={() => handleDeleteService(service)}
                                  disabled={servicesAreMutating}
                                >
                                  Eliminar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
