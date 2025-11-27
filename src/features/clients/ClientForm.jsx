import React, { useMemo, useState } from 'react'
import Button from '../../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import InfoTooltip from '../../components/ui/InfoTooltip.jsx'
import { CLIENT_PRICE } from '../../store/useBackofficeStore.js'
import { createInitialServiceState } from './utils.js'

const defaultForm = {
  type: 'residential',
  name: '',
  location: '',
  zoneId: '',
  notes: '',
  ip: '',
  antennaIp: '',
  modemIp: '',
  antennaModel: '',
  modemModel: '',
  debtMonths: 0,
  paidMonthsAhead: 0,
  monthlyFee: CLIENT_PRICE,
}

export default function ClientForm({ servicePlans, onSubmit, isSubmitting }) {
  const [formState, setFormState] = useState(defaultForm)
  const [serviceState, setServiceState] = useState(createInitialServiceState())
  const [error, setError] = useState('')

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

  const handleChange = (key, value) => {
    setFormState((prev) => ({ ...prev, [key]: value }))
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

  const normalizedCustomPrice = useMemo(() => {
    const parsed = Number(serviceState.customPrice)
    return Number.isFinite(parsed) ? parsed : ''
  }, [serviceState.customPrice])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await onSubmit({
        client: formState,
        service: serviceState.servicePlanId
          ? {
              clientId: null,
              servicePlanId: serviceState.servicePlanId,
              billingDay: Number(serviceState.billingDay) || 1,
              baseId: serviceState.baseId ? Number(serviceState.baseId) : null,
              ipAddress: serviceState.ipAddress?.trim() || undefined,
              antennaIp: serviceState.antennaIp?.trim() || undefined,
              modemIp: serviceState.modemIp?.trim() || undefined,
              antennaModel: serviceState.antennaModel?.trim() || undefined,
              modemModel: serviceState.modemModel?.trim() || undefined,
              customPrice:
                normalizedCustomPrice === '' ? undefined : Number(serviceState.customPrice),
              status: 'active',
            }
          : null,
      })
      setFormState(defaultForm)
      setServiceState(createInitialServiceState())
    } catch (submitError) {
      setError(submitError?.message ?? 'No se pudo crear el cliente')
    }
  }

  return (
    <Card data-testid="client-form">
      <CardHeader>
        <CardTitle>Agregar cliente</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium" htmlFor="name">
              Nombre completo
            </label>
            <input
              id="name"
              className="mt-1 w-full rounded border border-slate-200 p-2"
              required
              data-testid="client-name"
              value={formState.name}
              onChange={(event) => handleChange('name', event.target.value)}
              placeholder="Nombre del cliente"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium" htmlFor="location">
                Ubicación
              </label>
              <input
                id="location"
                className="mt-1 w-full rounded border border-slate-200 p-2"
                data-testid="client-location"
                value={formState.location}
                onChange={(event) => handleChange('location', event.target.value)}
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium" htmlFor="zoneId">
                Zona
                <InfoTooltip text="Etiqueta opcional para agrupar clientes." />
              </label>
              <input
                id="zoneId"
                className="mt-1 w-full rounded border border-slate-200 p-2"
                data-testid="client-zone"
                value={formState.zoneId}
                onChange={(event) => handleChange('zoneId', event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium" htmlFor="monthlyFee">
                Tarifa mensual
              </label>
              <input
                id="monthlyFee"
                type="number"
                min="0"
                className="mt-1 w-full rounded border border-slate-200 p-2"
                value={formState.monthlyFee}
                onChange={(event) => handleChange('monthlyFee', Number(event.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="notes">
                Notas
              </label>
              <input
                id="notes"
                className="mt-1 w-full rounded border border-slate-200 p-2"
                value={formState.notes}
                onChange={(event) => handleChange('notes', event.target.value)}
              />
            </div>
          </div>

          <div className="rounded border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Servicio inicial</span>
              <InfoTooltip text="Opcional: asigna el plan principal del cliente" />
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <select
                className="rounded border border-slate-200 p-2"
                data-testid="service-plan"
                value={serviceState.servicePlanId}
                onChange={handlePlanChange}
              >
                <option value="">Sin asignar</option>
                {availablePlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="rounded border border-slate-200 p-2"
                min="1"
                max="31"
                data-testid="service-billing-day"
                value={serviceState.billingDay}
                onChange={(event) => handleServiceStateChange('billingDay', event.target.value)}
              />
            </div>
            {selectedPlan && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium" htmlFor="service-price">
                      Precio del plan
                    </label>
                    <input
                      id="service-price"
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
                    <label className="text-sm font-medium" htmlFor="service-notes">
                      Notas del servicio
                    </label>
                    <input
                      id="service-notes"
                      className="mt-1 w-full rounded border border-slate-200 p-2"
                      value={serviceState.notes}
                      onChange={(event) => handleServiceStateChange('notes', event.target.value)}
                    />
                  </div>
                </div>

                {selectedPlan.requiresIp && (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium" htmlFor="service-ip">
                        Dirección IP
                      </label>
                      <input
                        id="service-ip"
                        className="mt-1 w-full rounded border border-slate-200 p-2"
                        placeholder="000.000.000.000"
                        value={serviceState.ipAddress}
                        onChange={(event) =>
                          handleServiceStateChange('ipAddress', event.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium" htmlFor="service-modem-ip">
                        IP del módem
                      </label>
                      <input
                        id="service-modem-ip"
                        className="mt-1 w-full rounded border border-slate-200 p-2"
                        value={serviceState.modemIp}
                        onChange={(event) =>
                          handleServiceStateChange('modemIp', event.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium" htmlFor="service-antenna-ip">
                        IP de antena
                      </label>
                      <input
                        id="service-antenna-ip"
                        className="mt-1 w-full rounded border border-slate-200 p-2"
                        value={serviceState.antennaIp}
                        onChange={(event) =>
                          handleServiceStateChange('antennaIp', event.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium" htmlFor="service-modem-model">
                        Modelo de módem/ont
                      </label>
                      <input
                        id="service-modem-model"
                        className="mt-1 w-full rounded border border-slate-200 p-2"
                        value={serviceState.modemModel}
                        onChange={(event) =>
                          handleServiceStateChange('modemModel', event.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium" htmlFor="service-antenna-model">
                        Modelo de antena
                      </label>
                      <input
                        id="service-antenna-model"
                        className="mt-1 w-full rounded border border-slate-200 p-2"
                        value={serviceState.antennaModel}
                        onChange={(event) =>
                          handleServiceStateChange('antennaModel', event.target.value)
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting} data-testid="submit-client">
              Guardar cliente
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
