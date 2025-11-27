import React, { useMemo, useState } from 'react'
import Button from '../../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import { createInitialServiceState } from './utils.js'

export default function ServicesAssignments({
  client,
  servicePlans,
  onAssign,
  onChangeStatus,
  onDeleteService,
  isProcessing,
}) {
  const [serviceState, setServiceState] = useState(() => createInitialServiceState())

  const availablePlans = useMemo(
    () =>
      servicePlans.filter(
        (plan) => (plan.serviceType ?? plan.category) !== 'token' && plan.isActive !== false,
      ),
    [servicePlans],
  )

  const selectedPlan = useMemo(
    () => availablePlans.find((plan) => String(plan.id) === String(serviceState.servicePlanId)),
    [availablePlans, serviceState.servicePlanId],
  )

  if (!client) {
    return null
  }

  const handleAssign = () => {
    if (!serviceState.servicePlanId) return
    onAssign?.({
      ...serviceState,
      clientId: client.id,
      servicePlanId: serviceState.servicePlanId,
      billingDay: Number(serviceState.billingDay) || 1,
      baseId: serviceState.baseId ? Number(serviceState.baseId) : null,
      ipAddress: serviceState.ipAddress?.trim() || undefined,
      antennaIp: serviceState.antennaIp?.trim() || undefined,
      modemIp: serviceState.modemIp?.trim() || undefined,
      antennaModel: serviceState.antennaModel?.trim() || undefined,
      modemModel: serviceState.modemModel?.trim() || undefined,
      customPrice: serviceState.customPrice === '' ? undefined : Number(serviceState.customPrice),
    })
    setServiceState(createInitialServiceState(client.zoneId))
  }

  const handlePlanChange = (event) => {
    const planId = event.target.value
    const plan = availablePlans.find((item) => String(item.id) === String(planId))
    setServiceState((prev) => ({
      ...prev,
      servicePlanId: planId,
      serviceType: plan?.serviceType ?? plan?.category ?? prev.serviceType,
      customPrice: plan ? plan.defaultMonthlyFee : '',
      ipAddress: plan?.requiresIp ? prev.ipAddress : '',
      antennaIp: plan?.requiresIp ? prev.antennaIp : '',
      modemIp: plan?.requiresIp ? prev.modemIp : '',
    }))
  }

  const handleServiceStateChange = (key, value) => {
    setServiceState((prev) => ({ ...prev, [key]: value }))
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
          {selectedPlan && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium" htmlFor="assignment-price">
                    Precio del plan
                  </label>
                  <input
                    id="assignment-price"
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 w-full rounded border border-slate-200 p-2"
                    value={serviceState.customPrice}
                    onChange={(event) =>
                      handleServiceStateChange('customPrice', event.target.value)
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="assignment-notes">
                    Notas del servicio
                  </label>
                  <input
                    id="assignment-notes"
                    className="mt-1 w-full rounded border border-slate-200 p-2"
                    value={serviceState.notes}
                    onChange={(event) => handleServiceStateChange('notes', event.target.value)}
                  />
                </div>
              </div>

              {selectedPlan.requiresIp && (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
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
                </div>
              )}
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
                <div>
                  <p className="font-medium">{service.name || 'Servicio'}</p>
                  <p className="text-sm text-slate-600">Estado: {service.status}</p>
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
                    data-testid={`delete-service-${service.id}`}
                    onClick={() => onDeleteService?.(service.id)}
                  >
                    Eliminar
                  </Button>
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
