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

  useEffect(() => {
    setServiceState(createInitialServiceState(client?.zoneId))
  }, [client?.zoneId])

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

  const selectedPlanPrice = useMemo(() => resolvePlanPrice(selectedPlan), [selectedPlan])

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
    const selectedPlan = findPlanById(serviceState.servicePlanId)
    const errors = computeServiceFormErrors(serviceState, {
      plan: selectedPlan,
      validateTechnicalFields: false,
    })

    const firstError = Object.values(errors)[0]
    if (firstError) {
      setError(firstError)
      return
    }

    if (!serviceState.servicePlanId) return
    onAssign?.(mapServicePayload(serviceState, { clientId: client.id }))
    setServiceState(createInitialServiceState(client.zoneId))
  }

  const startEdit = (service) => {
    setEditError('')
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
    const selectedPlan = findPlanById(editState.servicePlanId)
    const errors = computeServiceFormErrors(editState, {
      plan: selectedPlan,
      validateTechnicalFields: false,
    })

    const firstError = Object.values(errors)[0]
    if (firstError) {
      setEditError(firstError)
      return
    }

    const payload = mapServicePayload(editState, { forUpdate: true })

    onUpdateService?.(editState.id, payload)
    setEditState(null)
  }

  const handlePlanChange = (event) => {
    const planId = event.target.value
    const plan = findPlanById(planId)
    const requirements = resolvePlanRequirements(plan)
    const suggestedPrice = resolvePlanPrice(plan)
    setServiceState((prev) => ({
      ...prev,
      servicePlanId: planId,
      serviceType: plan?.serviceType ?? plan?.category ?? prev.serviceType,
      price: suggestedPrice === null ? '' : String(suggestedPrice),
      ipAddress: requirements.requiresIp ? prev.ipAddress : '',
      antennaIp: requirements.requiresIp ? prev.antennaIp : '',
      modemIp: requirements.requiresIp ? prev.modemIp : '',
      antennaModel: requirements.requiresEquipment ? prev.antennaModel : '',
      modemModel: requirements.requiresEquipment ? prev.modemModel : '',
      notes: prev.notes,
    }))
  }

  const handleServiceStateChange = (key, value) => {
    setServiceState((prev) => ({ ...prev, [key]: value }))
  }

  const { requiresBase, requiresIp, requiresCredentials, requiresEquipment } =
    selectedPlanRequirements
  const showEquipmentFields = requiresEquipment || requiresIp

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
            <div className="mt-3 space-y-2 text-sm">
              {requiresBase && (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <label className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={serviceState.useClientBase}
                      onChange={(event) => {
                        const shouldUseClientBase = event.target.checked
                        setServiceState((prev) => ({
                          ...prev,
                          useClientBase: shouldUseClientBase,
                          baseId: shouldUseClientBase ? client.zoneId : prev.baseId,
                        }))
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-blue-500"
                    />
                    Usar zona del cliente como base
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="rounded border border-slate-200 p-2"
                    value={serviceState.baseId}
                    onChange={(event) =>
                      setServiceState((prev) => ({ ...prev, baseId: event.target.value }))
                    }
                    disabled={serviceState.useClientBase}
                    placeholder="ID de base/torre"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="assignment-price">
                  Tarifa mensual
                </label>
                <input
                  id="assignment-price"
                  type="number"
                  min="0"
                  className="w-full rounded border border-slate-200 p-2"
                  value={serviceState.price}
                  onChange={(event) =>
                    setServiceState((prev) => ({ ...prev, price: event.target.value }))
                  }
                  placeholder={
                    selectedPlanPrice !== null
                      ? `Usa el precio del plan: ${selectedPlanPrice}`
                      : 'Ejemplo: 120'
                  }
                />
                <p className="text-xs text-slate-500">
                  Deja el campo vacío para usar el precio configurado en el plan
                  {selectedPlanPrice !== null ? ` (${selectedPlanPrice})` : ''}.
                </p>
              </div>

              {(requiresIp || showEquipmentFields) && (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {requiresIp && (
                    <>
                      <input
                        className="rounded border border-slate-200 p-2"
                        placeholder="IP de servicio"
                        value={serviceState.ipAddress}
                        onChange={(event) =>
                          setServiceState((prev) => ({ ...prev, ipAddress: event.target.value }))
                        }
                      />
                      <input
                        className="rounded border border-slate-200 p-2"
                        placeholder="IP de antena"
                        value={serviceState.antennaIp}
                        onChange={(event) =>
                          setServiceState((prev) => ({ ...prev, antennaIp: event.target.value }))
                        }
                      />
                      <input
                        className="rounded border border-slate-200 p-2"
                        placeholder="IP de módem"
                        value={serviceState.modemIp}
                        onChange={(event) =>
                          setServiceState((prev) => ({ ...prev, modemIp: event.target.value }))
                        }
                      />
                    </>
                  )}

                  {showEquipmentFields && (
                    <>
                      <input
                        className="rounded border border-slate-200 p-2"
                        placeholder="Modelo antena"
                        value={serviceState.antennaModel}
                        onChange={(event) =>
                          setServiceState((prev) => ({ ...prev, antennaModel: event.target.value }))
                        }
                      />
                      <input
                        className="rounded border border-slate-200 p-2"
                        placeholder="Modelo módem"
                        value={serviceState.modemModel}
                        onChange={(event) =>
                          setServiceState((prev) => ({ ...prev, modemModel: event.target.value }))
                        }
                      />
                    </>
                  )}
                </div>
              )}
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}
          {selectedPlan && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-800">Precio del plan</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {selectedPlanPrice !== null ? `$${selectedPlanPrice}` : 'N/D'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Si dejas la tarifa mensual vacía, se cobrará este valor automáticamente.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="assignment-notes">
                    Notas del servicio {requiresCredentials && <span className="text-red-600">*</span>}
                  </label>
                  <input
                    id="assignment-notes"
                    className="mt-1 w-full rounded border border-slate-200 p-2"
                    value={serviceState.notes}
                    onChange={(event) => handleServiceStateChange('notes', event.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium" htmlFor="assignment-debt-months">
                    Meses vencidos
                  </label>
                  <input
                    id="assignment-debt-months"
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 w-full rounded border border-slate-200 p-2"
                    value={serviceState.debtMonths}
                    onChange={(event) => handleServiceStateChange('debtMonths', event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="assignment-debt-amount">
                    Monto pendiente
                  </label>
                  <input
                    id="assignment-debt-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 w-full rounded border border-slate-200 p-2"
                    value={serviceState.debtAmount}
                    onChange={(event) => handleServiceStateChange('debtAmount', event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="assignment-debt-notes">
                    Notas de adeudo
                  </label>
                  <input
                    id="assignment-debt-notes"
                    className="mt-1 w-full rounded border border-slate-200 p-2"
                    value={serviceState.debtNotes}
                    onChange={(event) => handleServiceStateChange('debtNotes', event.target.value)}
                  />
                </div>
              </div>

              {(requiresIp || showEquipmentFields) && (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {requiresIp && (
                    <>
                      <div>
                        <label className="text-sm font-medium" htmlFor="assignment-ip">
                          Dirección IP
                        </label>
                        <input
                          id="assignment-ip"
                          className="mt-1 w-full rounded border border-slate-200 p-2"
                          placeholder="000.000.000.000"
                          value={serviceState.ipAddress}
                          onChange={(event) => handleServiceStateChange('ipAddress', event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium" htmlFor="assignment-modem-ip">
                          IP del módem
                        </label>
                        <input
                          id="assignment-modem-ip"
                          className="mt-1 w-full rounded border border-slate-200 p-2"
                          value={serviceState.modemIp}
                          onChange={(event) => handleServiceStateChange('modemIp', event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium" htmlFor="assignment-antenna-ip">
                          IP de antena
                        </label>
                        <input
                          id="assignment-antenna-ip"
                          className="mt-1 w-full rounded border border-slate-200 p-2"
                          value={serviceState.antennaIp}
                          onChange={(event) => handleServiceStateChange('antennaIp', event.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {showEquipmentFields && (
                    <>
                      <div>
                        <label className="text-sm font-medium" htmlFor="assignment-modem-model">
                          Modelo de módem/ont
                        </label>
                        <input
                          id="assignment-modem-model"
                          className="mt-1 w-full rounded border border-slate-200 p-2"
                          value={serviceState.modemModel}
                          onChange={(event) => handleServiceStateChange('modemModel', event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium" htmlFor="assignment-antenna-model">
                          Modelo de antena
                        </label>
                        <input
                          id="assignment-antenna-model"
                          className="mt-1 w-full rounded border border-slate-200 p-2"
                          value={serviceState.antennaModel}
                          onChange={(event) => handleServiceStateChange('antennaModel', event.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
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
                                  placeholder="IP de servicio"
                                  value={editState.ipAddress}
                                  onChange={(event) =>
                                    setEditState((prev) => ({ ...prev, ipAddress: event.target.value }))
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
