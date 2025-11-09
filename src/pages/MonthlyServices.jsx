import React, { useCallback, useMemo, useState } from 'react'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { useServicePlans } from '../hooks/useServicePlans.js'
import { useToast } from '../hooks/useToast.js'
import {
  SERVICE_TYPE_OPTIONS,
  getServiceTypeLabel,
} from '../constants/serviceTypes.js'
import { peso } from '../utils/formatters.js'
import { computeServicePlanFormErrors } from '../utils/servicePlanFormValidation.js'

const SUB_TABS = [
  { id: 'list', label: 'Servicios disponibles' },
  { id: 'create', label: 'Agregar servicio mensual' },
]

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
]

const STATUS_BADGE_STYLES = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  inactive: 'border-slate-200 bg-slate-100 text-slate-600',
}

const STATUS_LABELS = {
  active: 'Activo',
  inactive: 'Inactivo',
}

const createDefaultPlanForm = () => ({
  name: 'Internet mensual',
  serviceType: 'internet',
  defaultMonthlyFee: '300',
  description: '',
  status: 'active',
  requiresIp: true,
  requiresBase: true,
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
    servicePlans,
    status: plansStatus,
    isLoading: isLoadingPlans,
    isMutating: isMutatingPlans,
    reload: reloadPlans,
    createServicePlan,
    updateServicePlan,
    deleteServicePlan,
  } = useServicePlans()
  const { showToast } = useToast()

  const isEmbedded = variant === 'embedded'

  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('list')
  const [editingPlanId, setEditingPlanId] = useState(null)
  const [formState, setFormState] = useState(() => createDefaultPlanForm())
  const [formErrors, setFormErrors] = useState({})

  const plansWithStatus = useMemo(
    () =>
      servicePlans.map((plan) => ({
        ...plan,
        status: plan.isActive ? 'active' : 'inactive',
      })),
    [servicePlans],
  )

  const filteredPlans = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return plansWithStatus.filter((plan) => {
      if (typeFilter !== 'all' && plan.serviceType !== typeFilter) {
        return false
      }
      if (statusFilter !== 'all' && plan.status !== statusFilter) {
        return false
      }
      if (!normalizedSearch) {
        return true
      }
      const haystack = [plan.name, plan.description]
        .filter(Boolean)
        .map((value) => value.toLowerCase())
      return haystack.some((value) => value.includes(normalizedSearch))
    })
  }, [plansWithStatus, typeFilter, statusFilter, searchTerm])

  const sortedPlans = useMemo(() => {
    return [...filteredPlans].sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
    )
  }, [filteredPlans])

  const resetForm = useCallback(() => {
    setFormState(createDefaultPlanForm())
    setFormErrors({})
    setEditingPlanId(null)
  }, [])

  const handleSelectTab = useCallback(
    (tabId) => {
      if (tabId === 'list') {
        resetForm()
        setActiveTab('list')
        return
      }

      setActiveTab('create')
      if (!editingPlanId) {
        resetForm()
      }
    },
    [editingPlanId, resetForm],
  )

  const validateForm = useCallback(() => {
    const errors = computeServicePlanFormErrors(formState)
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }, [formState])

  const handleEditPlan = useCallback((plan) => {
    if (!plan) {
      return
    }
    setActiveTab('create')
    setEditingPlanId(plan.id)
    setFormErrors({})
    setFormState({
      name: plan.name ?? '',
      serviceType: plan.serviceType ?? 'internet',
      defaultMonthlyFee:
        plan.defaultMonthlyFee === null || plan.defaultMonthlyFee === undefined
          ? ''
          : String(plan.defaultMonthlyFee),
      description: plan.description ?? '',
      status: plan.isActive ? 'active' : 'inactive',
      requiresIp: Boolean(plan.requiresIp),
      requiresBase: Boolean(plan.requiresBase),
    })
  }, [])

  const handleDeletePlan = useCallback(
    async (plan) => {
      if (!plan) {
        return
      }
      const confirmed = window.confirm(`¿Eliminar ${plan.name}?`)
      if (!confirmed) {
        return
      }
      try {
        await deleteServicePlan(plan.id)
        showToast({
          type: 'success',
          title: 'Servicio eliminado',
          description: `${plan.name} se eliminó correctamente.`,
        })
      } catch (error) {
        showToast({
          type: 'error',
          title: 'No se pudo eliminar el servicio',
          description: error?.message ?? 'Intenta nuevamente.',
        })
      }
    },
    [deleteServicePlan, showToast],
  )

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault()
      if (!validateForm()) {
        return
      }

      const trimmedName = formState.name.trim()
      const trimmedDescription = formState.description?.trim() ?? ''
      const priceValue = formState.defaultMonthlyFee
      const parsedPrice =
        priceValue === '' || priceValue === null
          ? null
          : Number(priceValue)
      const normalizedPrice = Number.isFinite(parsedPrice) ? parsedPrice : null

      const payload = {
        name: trimmedName,
        serviceType: formState.serviceType,
        defaultMonthlyFee: normalizedPrice ?? 0,
        description: trimmedDescription,
        isActive: formState.status === 'active',
        requiresIp: Boolean(formState.requiresIp),
        requiresBase: Boolean(formState.requiresBase),
      }

      try {
        if (editingPlanId) {
          await updateServicePlan(editingPlanId, payload)
          showToast({
            type: 'success',
            title: 'Servicio actualizado',
            description: `${trimmedName} se actualizó correctamente.`,
          })
        } else {
          await createServicePlan(payload)
          showToast({
            type: 'success',
            title: 'Servicio registrado',
            description: `${trimmedName} se creó correctamente.`,
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
    },
    [
      createServicePlan,
      editingPlanId,
      formState,
      resetForm,
      showToast,
      updateServicePlan,
      validateForm,
    ],
  )

  const isEditing = Boolean(editingPlanId)
  const plansAreMutating = Boolean(isMutatingPlans)
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
              ? 'Consulta y reutiliza los servicios mensuales disponibles sin salir del panel de clientes.'
              : 'Administra el catálogo de servicios mensuales, define precios por defecto y controla su disponibilidad.'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
          onClick={() => reloadPlans().catch(() => {})}
          disabled={isLoadingPlans || plansAreMutating}
        >
          Actualizar listado
        </Button>
      </div>

      {plansStatus?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {plansStatus.error}
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
              <span className="text-xs font-medium text-slate-600">Editando servicio existente</span>
            ) : null}
          </div>

          {activeTab === 'create' ? (
            <form
              onSubmit={handleSubmit}
              className="grid gap-4 rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm"
            >
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span>Nombre del servicio</span>
                <input
                  value={formState.name}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    formErrors.name
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  }`}
                  placeholder="Servicio mensual"
                  autoComplete="off"
                />
                {formErrors.name && (
                  <span className="text-xs font-medium text-red-600">{formErrors.name}</span>
                )}
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span>Tipo de servicio</span>
                  <select
                    value={formState.serviceType}
                    onChange={(event) => {
                      const nextType = event.target.value
                      setFormState((prev) => {
                        if (prev.serviceType === nextType) {
                          return prev
                        }
                        const isInternet = nextType === 'internet'
                        return {
                          ...prev,
                          serviceType: nextType,
                          requiresIp: isInternet ? true : false,
                          requiresBase: isInternet ? true : false,
                        }
                      })
                    }}
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                      formErrors.serviceType
                        ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                        : 'border-slate-300'
                    }`}
                  >
                    {SERVICE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {formErrors.serviceType && (
                    <span className="text-xs font-medium text-red-600">
                      {formErrors.serviceType}
                    </span>
                  )}
                </label>

                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span>Tarifa mensual predeterminada (MXN)</span>
                  <input
                    value={formState.defaultMonthlyFee}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        defaultMonthlyFee: event.target.value,
                      }))
                    }
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                      formErrors.defaultMonthlyFee
                        ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                        : 'border-slate-300'
                    }`}
                  />
                  {formErrors.defaultMonthlyFee && (
                    <span className="text-xs font-medium text-red-600">
                      {formErrors.defaultMonthlyFee}
                    </span>
                  )}
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={Boolean(formState.requiresIp)}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        requiresIp: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    Requiere asignar IP disponible
                    <span className="block text-[11px] font-normal text-slate-500">
                      Activa esta opción para mostrar campos de IP al asignar el servicio a un cliente.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={Boolean(formState.requiresBase)}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        requiresBase: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    Requiere seleccionar base o nodo
                    <span className="block text-[11px] font-normal text-slate-500">
                      Define si el servicio debe asociarse a una base específica al asignarlo.
                    </span>
                  </span>
                </label>
              </div>

              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span>Descripción (opcional)</span>
                <textarea
                  value={formState.description}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, description: event.target.value }))
                  }
                  rows={3}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                  placeholder="Detalles para identificar este servicio"
                />
              </label>

              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span>Estado</span>
                <select
                  value={formState.status}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, status: event.target.value }))
                  }
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </label>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
                  onClick={() => {
                    resetForm()
                    setActiveTab('list')
                  }}
                  disabled={plansAreMutating}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={plansAreMutating}>
                  {isEditing ? 'Guardar cambios' : 'Guardar servicio'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span>Buscar</span>
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                    placeholder="Nombre o descripción"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span>Tipo de servicio</span>
                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                  >
                    <option value="all">Todos los tipos</option>
                    {SERVICE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span>Estado</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                  >
                    {STATUS_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {isLoadingPlans && servicePlans.length === 0 ? (
                <p className="text-sm text-slate-500">Cargando servicios…</p>
              ) : sortedPlans.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center">
                  <p className="text-sm font-medium text-slate-600">
                    No hay servicios que coincidan con los filtros seleccionados.
                  </p>
                  <p className="text-sm text-slate-500">
                    Crea un nuevo servicio mensual y asígnalo a tus clientes desde su registro.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {sortedPlans.map((plan) => {
                    const status = plan.status ?? 'inactive'
                    const statusLabel = STATUS_LABELS[status] ?? 'Inactivo'
                    const badgeClasses = STATUS_BADGE_STYLES[status] ?? STATUS_BADGE_STYLES.inactive

                    return (
                      <div
                        key={plan.id}
                        className="flex h-full flex-col justify-between rounded-md border border-slate-200 bg-white p-4"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
                              <p className="text-xs uppercase text-slate-500">
                                {getServiceTypeLabel(plan.serviceType)}
                              </p>
                            </div>
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClasses}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="space-y-1 text-xs text-slate-600">
                            <p>Tarifa predeterminada: {formatCurrency(plan.defaultMonthlyFee)}</p>
                            {plan.description ? <p className="text-slate-500">{plan.description}</p> : null}
                            <div className="flex flex-wrap gap-2">
                              {plan.requiresIp ? (
                                <span className="inline-flex items-center rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  Requiere IP disponible
                                </span>
                              ) : null}
                              {plan.requiresBase ? (
                                <span className="inline-flex items-center rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  Requiere base asignada
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => handleEditPlan(plan)}
                            disabled={plansAreMutating}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="border border-slate-200 text-slate-700 hover:border-red-200 hover:text-red-600"
                            onClick={() => handleDeletePlan(plan)}
                            disabled={plansAreMutating}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
