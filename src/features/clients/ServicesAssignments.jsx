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
    () => servicePlans.filter((plan) => (plan.serviceType ?? plan.category) !== 'token'),
    [servicePlans],
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
    })
    setServiceState(createInitialServiceState(client.zoneId))
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
