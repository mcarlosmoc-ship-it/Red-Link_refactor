import React, { useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import { planRequiresIp } from '../../utils/servicePlanMetadata.js'
import { computeServiceFormErrors } from '../../utils/serviceFormValidation.js'
import { createInitialServiceState } from './utils.js'

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
    () => servicePlans.filter((plan) => (plan.serviceType ?? plan.category) !== 'token'),
    [servicePlans],
  )

  if (!client) {
    return null
  }

  const handleAssign = () => {
    setError('')
    const selectedPlan = availablePlans.find(
      (plan) => String(plan.id) === String(serviceState.servicePlanId),
    )
    const errors = computeServiceFormErrors(serviceState, {
      plan: selectedPlan,
      validateTechnicalFields: false,
    })

    if (planRequiresIp(selectedPlan) && !serviceState.ipAddress) {
      errors.ipAddress = 'Asigna una IP disponible para este servicio.'
    }

    const firstError = Object.values(errors)[0]
    if (firstError) {
      setError(firstError)
      return
    }

    if (!serviceState.servicePlanId) return
    onAssign?.({
      ...serviceState,
      clientId: client.id,
      servicePlanId: serviceState.servicePlanId,
      billingDay: Number(serviceState.billingDay) || 1,
      baseId: serviceState.baseId ? Number(serviceState.baseId) : null,
      ipAddress: serviceState.ipAddress || null,
      antennaIp: serviceState.antennaIp || null,
      modemIp: serviceState.modemIp || null,
      antennaModel: serviceState.antennaModel || null,
      modemModel: serviceState.modemModel || null,
      customPrice: serviceState.isCustomPriceEnabled ? Number(serviceState.price) || 0 : undefined,
    })
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
      isCustomPriceEnabled: Boolean(service.customPrice || service.customPrice === 0),
      price: service.customPrice ?? '',
      ipAddress: service.ipAddress ?? '',
      antennaIp: service.antennaIp ?? '',
      modemIp: service.modemIp ?? '',
      antennaModel: service.antennaModel ?? '',
      modemModel: service.modemModel ?? '',
      notes: service.notes ?? '',
    })
  }

  const handleEditSave = () => {
    if (!editState?.id) return
    setEditError('')
    const selectedPlan = availablePlans.find(
      (plan) => String(plan.id) === String(editState.servicePlanId),
    )
    const errors = computeServiceFormErrors(editState, {
      plan: selectedPlan,
      validateTechnicalFields: false,
    })

    if (planRequiresIp(selectedPlan) && !editState.ipAddress) {
      errors.ipAddress = 'Asigna una IP disponible para este servicio.'
    }

    const firstError = Object.values(errors)[0]
    if (firstError) {
      setEditError(firstError)
      return
    }

    const payload = {
      servicePlanId: editState.servicePlanId,
      billingDay: Number(editState.billingDay) || 1,
      baseId: editState.baseId ? Number(editState.baseId) : null,
      ipAddress: editState.ipAddress || null,
      antennaIp: editState.antennaIp || null,
      modemIp: editState.modemIp || null,
      antennaModel: editState.antennaModel || null,
      modemModel: editState.modemModel || null,
      customPrice: editState.isCustomPriceEnabled ? Number(editState.price) || 0 : null,
      notes: editState.notes || null,
    }

    onUpdateService?.(editState.id, payload)
    setEditState(null)
  }

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
              onChange={(event) =>
                setServiceState((prev) => ({ ...prev, servicePlanId: event.target.value }))
              }
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
              onChange={(event) =>
                setServiceState((prev) => ({ ...prev, billingDay: event.target.value }))
              }
            />
            <Button disabled={isProcessing} onClick={handleAssign} data-testid="assign-service">
              Asignar
            </Button>
          </div>
          {serviceState.servicePlanId && (
            <div className="mt-3 space-y-2 text-sm">
              {(() => {
                const selectedPlan = availablePlans.find(
                  (plan) => String(plan.id) === String(serviceState.servicePlanId),
                )
                const requiresIp = planRequiresIp(selectedPlan)

                return (
                  <>
                    {selectedPlan?.requiresBase && (
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

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <label className="flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={serviceState.isCustomPriceEnabled}
                          onChange={(event) =>
                            setServiceState((prev) => ({
                              ...prev,
                              isCustomPriceEnabled: event.target.checked,
                              price: event.target.checked ? prev.price : '',
                            }))
                          }
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-blue-500"
                        />
                        Tarifa personalizada
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="rounded border border-slate-200 p-2"
                        value={serviceState.price}
                        onChange={(event) =>
                          setServiceState((prev) => ({ ...prev, price: event.target.value }))
                        }
                        disabled={!serviceState.isCustomPriceEnabled}
                        placeholder="Monto personalizado"
                      />
                    </div>

                    {requiresIp && (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
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
                      </div>
                    )}
                  </>
                )
              })()}
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {Array.isArray(client.services) && client.services.length > 0 ? (
            client.services.map((service) => (
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
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={editState.isCustomPriceEnabled}
                            onChange={(event) =>
                              setEditState((prev) => ({
                                ...prev,
                                isCustomPriceEnabled: event.target.checked,
                                price: event.target.checked ? prev.price : '',
                              }))
                            }
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-blue-500"
                          />
                          Tarifa personalizada
                        </label>
                        <input
                          type="number"
                          min="0"
                          className="rounded border border-slate-200 p-2"
                          value={editState.price}
                          onChange={(event) =>
                            setEditState((prev) => ({ ...prev, price: event.target.value }))
                          }
                          disabled={!editState.isCustomPriceEnabled}
                          placeholder="Tarifa"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
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
            ))
          ) : (
            <p className="text-sm text-slate-600">El cliente aún no tiene servicios registrados.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
