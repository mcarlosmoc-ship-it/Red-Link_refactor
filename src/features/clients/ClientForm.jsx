import React, { useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import InfoTooltip from '../../components/ui/InfoTooltip.jsx'
import { CLIENT_PRICE } from '../../store/useBackofficeStore.js'
import { planRequiresIp } from '../../utils/servicePlanMetadata.js'
import { computeServiceFormErrors } from '../../utils/serviceFormValidation.js'
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

  const internetPlans = useMemo(
    () => servicePlans.filter((plan) => (plan.serviceType ?? plan.category) === 'internet'),
    [servicePlans],
  )

  const handleChange = (key, value) => {
    setFormState((prev) => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    if (!serviceState.useClientBase) return
    setServiceState((prev) => ({ ...prev, baseId: formState.zoneId }))
  }, [formState.zoneId, serviceState.useClientBase])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const selectedPlan = internetPlans.find(
      (plan) => String(plan.id) === String(serviceState.servicePlanId),
    )

    if (serviceState.servicePlanId) {
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
    }

    try {
      await onSubmit({
        client: formState,
        service: serviceState.servicePlanId
          ? {
              clientId: null,
              servicePlanId: serviceState.servicePlanId,
              billingDay: Number(serviceState.billingDay) || 1,
              baseId: serviceState.baseId ? Number(serviceState.baseId) : null,
              ipAddress: serviceState.ipAddress || null,
              antennaIp: serviceState.antennaIp || null,
              modemIp: serviceState.modemIp || null,
              antennaModel: serviceState.antennaModel || null,
              modemModel: serviceState.modemModel || null,
              customPrice: serviceState.isCustomPriceEnabled
                ? Number(serviceState.price) || 0
                : undefined,
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
                onChange={(event) =>
                  setServiceState((prev) => ({ ...prev, servicePlanId: event.target.value }))
                }
              >
                <option value="">Sin asignar</option>
                {internetPlans.map((plan) => (
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
                onChange={(event) =>
                  setServiceState((prev) => ({ ...prev, billingDay: event.target.value }))
                }
              />
            </div>

          {serviceState.servicePlanId && (
            <div className="mt-2 space-y-3">
              {(() => {
                const selectedPlan = internetPlans.find(
                  (plan) => String(plan.id) === String(serviceState.servicePlanId),
                )

                const requiresIp = planRequiresIp(selectedPlan)

                return (
                  <>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <input
                          id="customPrice"
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
                        <label className="text-sm font-medium" htmlFor="customPrice">
                          Tarifa personalizada
                        </label>
                      </div>
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

                    {selectedPlan?.requiresBase && (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={serviceState.useClientBase}
                            onChange={(event) => {
                              const shouldUseClientBase = event.target.checked
                              setServiceState((prev) => ({
                                ...prev,
                                useClientBase: shouldUseClientBase,
                                baseId: shouldUseClientBase ? formState.zoneId : prev.baseId,
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

                    {requiresIp && (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div>
                          <label className="text-sm font-medium" htmlFor="ipAddress">
                            IP de servicio
                          </label>
                          <input
                            id="ipAddress"
                            className="mt-1 w-full rounded border border-slate-200 p-2"
                            value={serviceState.ipAddress}
                            onChange={(event) =>
                              setServiceState((prev) => ({ ...prev, ipAddress: event.target.value }))
                            }
                            placeholder="192.168.0.10"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium" htmlFor="antennaIp">
                            IP de antena
                          </label>
                          <input
                            id="antennaIp"
                            className="mt-1 w-full rounded border border-slate-200 p-2"
                            value={serviceState.antennaIp}
                            onChange={(event) =>
                              setServiceState((prev) => ({ ...prev, antennaIp: event.target.value }))
                            }
                            placeholder="192.168.0.11"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium" htmlFor="modemIp">
                            IP de módem
                          </label>
                          <input
                            id="modemIp"
                            className="mt-1 w-full rounded border border-slate-200 p-2"
                            value={serviceState.modemIp}
                            onChange={(event) =>
                              setServiceState((prev) => ({ ...prev, modemIp: event.target.value }))
                            }
                            placeholder="192.168.0.12"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium" htmlFor="antennaModel">
                            Modelo de antena
                          </label>
                          <input
                            id="antennaModel"
                            className="mt-1 w-full rounded border border-slate-200 p-2"
                            value={serviceState.antennaModel}
                            onChange={(event) =>
                              setServiceState((prev) => ({ ...prev, antennaModel: event.target.value }))
                            }
                            placeholder="Modelo antena"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium" htmlFor="modemModel">
                            Modelo de módem
                          </label>
                          <input
                            id="modemModel"
                            className="mt-1 w-full rounded border border-slate-200 p-2"
                            value={serviceState.modemModel}
                            onChange={(event) =>
                              setServiceState((prev) => ({ ...prev, modemModel: event.target.value }))
                            }
                            placeholder="Modelo módem"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
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
