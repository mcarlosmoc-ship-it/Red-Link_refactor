import React, { useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import {
  planRequiresBase,
  planRequiresCredentials,
  planRequiresEquipment,
  planRequiresIp,
  resolvePlanRequirements,
} from '../../utils/servicePlanMetadata.js'
import { computeServiceFormErrors } from '../../utils/serviceFormValidation.js'
import { createInitialServiceState } from './utils.js'

const resolvePlanPrice = (plan) => {
  if (!plan) return null
  const price = plan.monthlyPrice ?? plan.defaultMonthlyFee
  const numeric = Number(price)
  return Number.isFinite(numeric) ? numeric : null
}

export default function ServicesAssignments({
  client,
  servicePlans,
  onAssign,
  onChangeStatus,
  onUpdateService,
  onDeleteService,
  isProcessing,
}) {
  const [serviceState, setServiceState] = useState(() => createInitialServiceState(client?.zoneId))
  const [editState, setEditState] = useState(null)
  const [error, setError] = useState('')
  const [editError, setEditError] = useState('')
  const [assignErrors, setAssignErrors] = useState({})
  const [editErrors, setEditErrors] = useState({})

  const initialServiceState = useMemo(() => createInitialServiceState(client?.zoneId), [client?.zoneId])

  useEffect(() => {
    if (!client) return

    setServiceState((previous) => {
      const isSameState = Object.keys(initialServiceState).every(
        (key) => previous[key] === initialServiceState[key],
      )

      return isSameState ? previous : initialServiceState
    })
  }, [client?.id, initialServiceState])

  const availablePlans = useMemo(
    () =>
      servicePlans.filter(
        (plan) => (plan.serviceType ?? plan.category) !== 'token' && plan.isActive !== false,
      ),
    [servicePlans],
  )

  const findPlanById = (planId) =>
    availablePlans.find((plan) => String(plan.id) === String(planId)) || null

  const selectedPlan = useMemo(
    () => findPlanById(serviceState.servicePlanId),
    [availablePlans, serviceState.servicePlanId],
  )

  const selectedPlanRequirements = useMemo(
    () => resolvePlanRequirements(selectedPlan),
    [selectedPlan],
  )

  if (!client) {
    return null
  }

  const mapServicePayload = (state, { clientId, forUpdate = false } = {}) => {
    const trim = (value) => (typeof value === 'string' ? value.trim() : value)
    const plan = findPlanById(state.servicePlanId)
    const planPrice = resolvePlanPrice(plan)
    const resolveBaseId = () => {
      const baseValue = state.useClientBase ? client?.zoneId : state.baseId
      const parsed = Number(baseValue)
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null
    }

    const hasPriceValue = state.price !== '' && state.price !== null && state.price !== undefined
    const parsedPrice = hasPriceValue ? Number(state.price) : null
    const normalizedPrice = Number.isFinite(parsedPrice) ? parsedPrice : null
    const customPrice =
      normalizedPrice === null
        ? undefined
        : planPrice !== null && planPrice === normalizedPrice
          ? undefined
          : normalizedPrice

      const payload = {
        ...(clientId ? { clientId } : {}),
        servicePlanId: state.servicePlanId,
        billingDay: Number(state.billingDay) || 1,
        baseId: resolveBaseId(),
        ipAddress: trim(state.ipAddress) || undefined,
        antennaIp: trim(state.antennaIp) || undefined,
        modemIp: trim(state.modemIp) || undefined,
        antennaModel: trim(state.antennaModel) || undefined,
        modemModel: trim(state.modemModel) || undefined,
      customPrice,
      debtAmount: state.debtAmount === '' ? undefined : Number(state.debtAmount) || 0,
      debtMonths: state.debtMonths === '' ? undefined : Number(state.debtMonths) || 0,
      debtNotes: trim(state.debtNotes) || undefined,
      notes: trim(state.notes) || undefined,
    }

    if (forUpdate) {
      const nullableKeys = [
        'baseId',
        'ipAddress',
        'antennaIp',
        'modemIp',
        'antennaModel',
        'modemModel',
        'debtAmount',
        'debtMonths',
        'debtNotes',
        'notes',
      ]
      for (const key of nullableKeys) {
        if (payload[key] === undefined) {
          payload[key] = null
        }
      }

      if (payload.customPrice === undefined) {
        payload.customPrice = null
      }
    }

    return payload
  }

  const handleAssign = () => {
    setError('')
    setAssignErrors({})
    const selectedPlan = findPlanById(serviceState.servicePlanId)
    const errors = computeServiceFormErrors(serviceState, {
      plan: selectedPlan,
      validateTechnicalFields: false,
      clientBaseId: client?.zoneId,
    })

    setAssignErrors(errors)
    const firstError = Object.values(errors)[0]
    if (firstError) {
      setError(firstError)
      return
    }

    if (!serviceState.servicePlanId) return
    onAssign?.(mapServicePayload(serviceState, { clientId: client.id }))
    setServiceState(createInitialServiceState(client.zoneId))
    setAssignErrors({})
  }

  const startEdit = (service) => {
    setEditError('')
    setEditErrors({})
    setEditState({
      id: service.id,
      servicePlanId: service.servicePlanId ?? service.plan?.id ?? '',
      billingDay: service.billingDay ?? '1',
      baseId: service.baseId ? String(service.baseId) : '',
      useClientBase: !service.baseId && Boolean(client.zoneId),
      price: service.customPrice ?? '',
      ipAddress: service.ipAddress ?? '',
      antennaIp: service.antennaIp ?? '',
      modemIp: service.modemIp ?? '',
      antennaModel: service.antennaModel ?? '',
      modemModel: service.modemModel ?? '',
      notes: service.notes ?? '',
      debtAmount: service.debtAmount ?? '',
      debtMonths: service.debtMonths ?? '',
      debtNotes: service.debtNotes ?? '',
    })
  }

  const handleEditSave = () => {
    if (!editState?.id) return
    setEditError('')
    setEditErrors({})
    const selectedPlan = findPlanById(editState.servicePlanId)
    const errors = computeServiceFormErrors(editState, {
      plan: selectedPlan,
      validateTechnicalFields: false,
      clientBaseId: client?.zoneId,
    })

    setEditErrors(errors)
    const firstError = Object.values(errors)[0]
    if (firstError) {
      setEditError(firstError)
      return
    }

    const payload = mapServicePayload(editState, { forUpdate: true })

    onUpdateService?.(editState.id, payload)
    setEditState(null)
    setEditErrors({})
  }

  const handlePlanChange = (event) => {
    const planId = event.target.value
    const plan = findPlanById(planId)
    const requirements = resolvePlanRequirements(plan)
    setServiceState((prev) => ({
      ...prev,
      servicePlanId: planId,
      serviceType: plan?.serviceType ?? plan?.category ?? prev.serviceType,
      price: '',
      ipAddress: requirements.requiresIp ? prev.ipAddress : '',
      antennaIp: '',
      modemIp: '',
      antennaModel: '',
      modemModel: '',
      notes: requirements.requiresCredentials ? prev.notes : '',
      baseId: requirements.requiresBase ? prev.baseId || client?.zoneId || '' : '',
      useClientBase: requirements.requiresBase ? Boolean(client?.zoneId) : false,
    }))
    setAssignErrors({})
  }

  const handleServiceStateChange = (key, value) => {
    setServiceState((prev) => ({ ...prev, [key]: value }))
  }

  const { requiresBase, requiresIp, requiresCredentials } = selectedPlanRequirements

  const resetBaseToClientZone = () => {
    if (!client?.zoneId) return
    setServiceState((prev) => ({
      ...prev,
      baseId: String(client.zoneId),
      useClientBase: true,
    }))
  }

  const renderRequirementBadges = (requirements, prefix) => (
    <div
      className="flex flex-wrap gap-2 text-xs text-slate-700"
      data-testid={`${prefix}-requirements`}
    >
      {requirements.requiresBase && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-800">
          Base obligatoria
        </span>
      )}
      {requirements.requiresIp && (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">
          IP requerida
        </span>
      )}
      {requirements.requiresEquipment && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
          Equipo registrado
        </span>
      )}
      {requirements.requiresCredentials && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-800">
          Credenciales/Notas
        </span>
      )}
    </div>
  )

  return (
    <Card data-testid="services-assignments">
      <CardHeader>
        <CardTitle>Servicios</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium">Asignar nuevo servicio</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <select
              className="rounded border border-slate-200 p-2"
              data-testid="assignment-plan"
              value={serviceState.servicePlanId}
              onChange={handlePlanChange}
            >
              <option value="">Selecciona plan</option>
              {availablePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              max="31"
              className="rounded border border-slate-200 p-2"
              data-testid="assignment-billing"
              value={serviceState.billingDay}
              onChange={(event) => handleServiceStateChange('billingDay', event.target.value)}
            />
            <Button disabled={isProcessing} onClick={handleAssign} data-testid="assign-service">
              Asignar
            </Button>
          </div>
          {serviceState.servicePlanId && (
            <div className="mt-3 space-y-3 text-sm">
              {renderRequirementBadges(selectedPlanRequirements, 'assignment')}

              {requiresBase && (
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="assignment-base">
                    Base / torre asignada
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="assignment-base"
                      type="number"
                      min="1"
                      className="w-full rounded border border-slate-200 p-2"
                      value={serviceState.baseId}
                      onChange={(event) =>
                        setServiceState((prev) => ({
                          ...prev,
                          baseId: event.target.value,
                          useClientBase: false,
                        }))
                      }
                      placeholder="ID de base/torre"
                    />
                    {client?.zoneId && (
                      <Button size="sm" variant="outline" onClick={resetBaseToClientZone}>
                        Usar base {client.zoneId}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Prefill automático con la base del cliente si está disponible.
                  </p>
                  {assignErrors.baseId && (
                    <p className="text-xs font-medium text-red-600" data-testid="assignment-base-error">
                      {assignErrors.baseId}
                    </p>
                  )}
                </div>
              )}

              {requiresIp && (
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="assignment-ip">
                    IP asignada
                  </label>
                  <input
                    id="assignment-ip"
                    className="w-full rounded border border-slate-200 p-2"
                    placeholder="Ejemplo: 10.0.0.10"
                    value={serviceState.ipAddress}
                    onChange={(event) =>
                      handleServiceStateChange('ipAddress', event.target.value)
                    }
                  />
                  <p className="text-xs text-slate-500">
                    Puedes dejarla vacía para asignar automáticamente la siguiente IP disponible.
                  </p>
                  {assignErrors.ipAddress && (
                    <p className="text-xs font-medium text-red-600" data-testid="assignment-ip-error">
                      {assignErrors.ipAddress}
                    </p>
                  )}
                </div>
              )}

              {requiresCredentials && (
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="assignment-notes">
                    Notas / credenciales
                  </label>
                  <input
                    id="assignment-notes"
                    className="w-full rounded border border-slate-200 p-2"
                    value={serviceState.notes}
                    onChange={(event) => handleServiceStateChange('notes', event.target.value)}
                  />
                  {assignErrors.notes && (
                    <p className="text-xs font-medium text-red-600" data-testid="assignment-notes-error">
                      {assignErrors.notes}
                    </p>
                  )}
                </div>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {Array.isArray(client.services) && client.services.length > 0 ? (
            client.services.map((service) => {
              const plan = findPlanById(service.servicePlanId ?? service.plan?.id)
              const planRequirements = resolvePlanRequirements(plan)
              const showTechnicalFields = planRequirements.requiresIp || planRequirements.requiresEquipment

              return (
                <div
                  key={service.id}
                  className="flex items-center justify-between rounded border border-slate-200 p-2"
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{service.name || 'Servicio'}</p>
                        <p className="text-sm text-slate-600">Estado: {service.status}</p>
                        <p className="text-sm text-slate-600">
                          Tarifa: {service.customPrice ?? service.price ?? 'N/D'}
                        </p>
                        {(Number(service.debtMonths ?? 0) > 0 || Number(service.debtAmount ?? 0) > 0) && (
                          <p className="mt-1 inline-flex items-center gap-2 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                            Adeudo: {Number(service.debtMonths ?? 0) > 0 ? `${service.debtMonths} mes(es)` : 'Pendiente'}
                            {Number(service.debtAmount ?? 0) > 0 && ` • $${service.debtAmount}`}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`suspend-${service.id}`}
                          onClick={() => onChangeStatus?.(service.id, 'suspended')}
                        >
                          Suspender
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`activate-${service.id}`}
                          onClick={() => onChangeStatus?.(service.id, 'active')}
                        >
                          Activar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(service)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`delete-service-${service.id}`}
                          onClick={() => onDeleteService?.(service.id)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-1 text-xs text-slate-600 md:grid-cols-2">
                      {service.ipAddress && <span>IP: {service.ipAddress}</span>}
                      {service.antennaIp && <span>IP antena: {service.antennaIp}</span>}
                      {service.modemIp && <span>IP módem: {service.modemIp}</span>}
                      {service.antennaModel && <span>Antena: {service.antennaModel}</span>}
                      {service.modemModel && <span>Módem: {service.modemModel}</span>}
                    </div>
                    {editState?.id === service.id && (
                      <div className="mt-2 space-y-2 rounded border border-slate-200 p-2">
                        {renderRequirementBadges(planRequirements, `edit-${service.id}`)}
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <input
                            type="number"
                            min="1"
                            max="31"
                            className="rounded border border-slate-200 p-2"
                            value={editState.billingDay}
                            onChange={(event) =>
                              setEditState((prev) => ({ ...prev, billingDay: event.target.value }))
                            }
                          />
                          {planRequirements.requiresBase && (
                            <input
                              type="number"
                              min="1"
                              className="rounded border border-slate-200 p-2"
                              value={editState.baseId}
                              onChange={(event) =>
                                setEditState((prev) => ({ ...prev, baseId: event.target.value }))
                              }
                              disabled={editState.useClientBase}
                              placeholder="Base/torre"
                            />
                          )}
                          {planRequirements.requiresBase && (
                            <label className="flex items-center gap-2 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={editState.useClientBase}
                                onChange={(event) => {
                                  const shouldUseClientBase = event.target.checked
                                  setEditState((prev) => ({
                                    ...prev,
                                    useClientBase: shouldUseClientBase,
                                    baseId: shouldUseClientBase ? client.zoneId : prev.baseId,
                                  }))
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-blue-500"
                              />
                              Usar zona del cliente
                            </label>
                          )}
                        </div>
                        {editErrors.baseId && (
                          <p className="text-xs font-medium text-red-600" data-testid={`edit-base-error-${service.id}`}>
                            {editErrors.baseId}
                          </p>
                        )}
                        <div className="space-y-1">
                          <label className="text-sm font-medium" htmlFor={`edit-price-${service.id}`}>
                            Tarifa mensual
                          </label>
                          <input
                            id={`edit-price-${service.id}`}
                            type="number"
                            min="0"
                            className="w-full rounded border border-slate-200 p-2"
                            value={editState.price}
                            onChange={(event) =>
                              setEditState((prev) => ({ ...prev, price: event.target.value }))
                            }
                            placeholder={
                              resolvePlanPrice(plan) !== null
                                ? `Precio del plan: ${resolvePlanPrice(plan)}`
                                : 'Ejemplo: 120'
                            }
                          />
                          <p className="text-xs text-slate-500">
                            Deja el campo vacío o igual al plan para volver al precio estándar.
                          </p>
                        </div>
                        {showTechnicalFields && (
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            {planRequirements.requiresIp && (
                              <>
                                <input
                                  className="rounded border border-slate-200 p-2"
                                  placeholder="IP principal"
                                  value={editState.ipAddress}
                                  onChange={(event) =>
                                    setEditState((prev) => ({
                                      ...prev,
                                      ipAddress: event.target.value,
                                    }))
                                  }
                                />
                                <input
                                  className="rounded border border-slate-200 p-2"
                                  placeholder="IP de antena"
                                  value={editState.antennaIp}
                                  onChange={(event) =>
                                    setEditState((prev) => ({ ...prev, antennaIp: event.target.value }))
                                  }
                                />
                                <input
                                  className="rounded border border-slate-200 p-2"
                                  placeholder="IP de módem"
                                  value={editState.modemIp}
                                  onChange={(event) =>
                                    setEditState((prev) => ({ ...prev, modemIp: event.target.value }))
                                  }
                                />
                              </>
                            )}
                            {planRequirements.requiresEquipment && (
                              <>
                                <input
                                  className="rounded border border-slate-200 p-2"
                                  placeholder="Modelo antena"
                                  value={editState.antennaModel}
                                  onChange={(event) =>
                                    setEditState((prev) => ({ ...prev, antennaModel: event.target.value }))
                                  }
                                />
                                <input
                                  className="rounded border border-slate-200 p-2"
                                  placeholder="Modelo módem"
                                  value={editState.modemModel}
                                  onChange={(event) =>
                                    setEditState((prev) => ({ ...prev, modemModel: event.target.value }))
                                  }
                                />
                              </>
                            )}
                          </div>
                        )}
                        {(editErrors.ipAddress || editErrors.antennaModel) && (
                          <div className="space-y-1 text-xs font-medium text-red-600">
                            {editErrors.ipAddress && (
                              <p data-testid={`edit-ip-error-${service.id}`}>
                                {editErrors.ipAddress}
                              </p>
                            )}
                            {editErrors.antennaModel && (
                              <p data-testid={`edit-equipment-error-${service.id}`}>
                                {editErrors.antennaModel}
                              </p>
                            )}
                          </div>
                        )}
                        {planRequirements.requiresCredentials && (
                          <div>
                            <label className="text-sm font-medium" htmlFor={`edit-notes-${service.id}`}>
                              Notas / credenciales
                            </label>
                            <input
                              id={`edit-notes-${service.id}`}
                              className="mt-1 w-full rounded border border-slate-200 p-2"
                              value={editState.notes}
                              onChange={(event) =>
                                setEditState((prev) => ({ ...prev, notes: event.target.value }))
                              }
                            />
                          </div>
                        )}
                        {editErrors.notes && (
                          <p className="text-xs font-medium text-red-600" data-testid={`edit-notes-error-${service.id}`}>
                            {editErrors.notes}
                          </p>
                        )}
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <div>
                            <label className="text-sm font-medium" htmlFor={`edit-debt-months-${service.id}`}>
                              Meses vencidos
                            </label>
                            <input
                              id={`edit-debt-months-${service.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              className="mt-1 w-full rounded border border-slate-200 p-2"
                              value={editState.debtMonths}
                              onChange={(event) =>
                                setEditState((prev) => ({ ...prev, debtMonths: event.target.value }))
                              }
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium" htmlFor={`edit-debt-amount-${service.id}`}>
                              Monto pendiente
                            </label>
                            <input
                              id={`edit-debt-amount-${service.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              className="mt-1 w-full rounded border border-slate-200 p-2"
                              value={editState.debtAmount}
                              onChange={(event) =>
                                setEditState((prev) => ({ ...prev, debtAmount: event.target.value }))
                              }
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium" htmlFor={`edit-debt-notes-${service.id}`}>
                              Notas de adeudo
                            </label>
                            <input
                              id={`edit-debt-notes-${service.id}`}
                              className="mt-1 w-full rounded border border-slate-200 p-2"
                              value={editState.debtNotes}
                              onChange={(event) =>
                                setEditState((prev) => ({ ...prev, debtNotes: event.target.value }))
                              }
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setEditState(null)}>
                            Cancelar
                          </Button>
                          <Button size="sm" onClick={handleEditSave} disabled={isProcessing}>
                            Guardar
                          </Button>
                        </div>
                        {editError && <p className="text-xs text-red-600">{editError}</p>}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-slate-600">El cliente aún no tiene servicios registrados.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
