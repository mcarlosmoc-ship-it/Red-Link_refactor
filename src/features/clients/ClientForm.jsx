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

  const selectedPlanMetadata = useMemo(
    () => selectedPlan?.metadata ?? selectedPlan?.serviceMetadata ?? {},
    [selectedPlan],
  )

  const requiresIp = planRequiresIp(selectedPlan)
  const requiresBase = Boolean(selectedPlan?.requiresBase)
  const requiresCredentials = Boolean(
    selectedPlanMetadata.requiresCredentials ??
      selectedPlanMetadata.requireCredentials ??
      selectedPlanMetadata.requires_credentials,
  )

  const basePlanPrice = useMemo(() => {
    const parsed = Number(selectedPlan?.monthlyPrice ?? selectedPlan?.defaultMonthlyFee)
    return Number.isFinite(parsed) ? parsed : null
  }, [selectedPlan])

  const formattedBasePrice = useMemo(() => {
    if (basePlanPrice === null) return ''
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
      basePlanPrice,
    )
  }, [basePlanPrice])

  const handleChange = (key, value) => {
    setFormState((prev) => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    if (!serviceState.useClientBase) return
    setServiceState((prev) => ({ ...prev, baseId: formState.zoneId }))
  }, [formState.zoneId, serviceState.useClientBase])
  const handlePlanChange = (event) => {
    const planId = event.target.value
    const plan = availablePlans.find((item) => String(item.id) === String(planId))
    setServiceState((prev) => ({
      ...prev,
      servicePlanId: planId,
      serviceType: plan?.serviceType ?? plan?.category ?? prev.serviceType,
      customPrice: plan ? plan.monthlyPrice ?? plan.defaultMonthlyFee : '',
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

    const selectedPlan = availablePlans.find(
      (plan) => String(plan.id) === String(serviceState.servicePlanId),
    )

    if (serviceState.servicePlanId) {
      const requiresIp = planRequiresIp(selectedPlan)
      const requiresCredentials = Boolean(
        selectedPlanMetadata.requiresCredentials ??
          selectedPlanMetadata.requireCredentials ??
          selectedPlanMetadata.requires_credentials,
      )

      const errors = computeServiceFormErrors(serviceState, {
        plan: selectedPlan,
        validateTechnicalFields: false,
      })

      if (requiresIp && !serviceState.ipAddress?.trim()) {
        errors.ipAddress = 'Asigna una IP disponible para este servicio.'
      }

      if (requiresCredentials && !serviceState.notes?.trim()) {
        errors.notes = 'Agrega las credenciales o notas de acceso del servicio.'
      }

      const firstError = Object.values(errors)[0]
      if (firstError) {
        setError(firstError)
        return
      }
    }

    try {
      const trimmedIpAddress = serviceState.ipAddress?.trim() || undefined
      const trimmedAntennaIp = serviceState.antennaIp?.trim() || undefined
      const trimmedModemIp = serviceState.modemIp?.trim() || undefined
      const trimmedAntennaModel = serviceState.antennaModel?.trim() || undefined
      const trimmedModemModel = serviceState.modemModel?.trim() || undefined

      const resolvedCustomPrice = serviceState.isCustomPriceEnabled
        ? Number(serviceState.price) || 0
        : normalizedCustomPrice === ''
          ? undefined
          : Number(serviceState.customPrice)

      await onSubmit({
        client: formState,
        service: serviceState.servicePlanId
          ? {
              clientId: null,
              servicePlanId: serviceState.servicePlanId,
              billingDay: Number(serviceState.billingDay) || 1,
              baseId: serviceState.baseId ? Number(serviceState.baseId) : null,
              ipAddress: trimmedIpAddress,
              antennaIp: trimmedAntennaIp,
              modemIp: trimmedModemIp,
              antennaModel: trimmedAntennaModel,
              modemModel: trimmedModemModel,
              customPrice: resolvedCustomPrice,
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
            <p className="mt-1 text-xs text-slate-600">
              Este servicio es opcional y el precio sugerido se toma del plan seleccionado.
              Puedes ajustarlo cuando sea necesario.
            </p>
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
              <div className="mt-2 space-y-1 text-xs text-slate-700">
                {formattedBasePrice && (
                  <p>
                    Precio base del plan{' '}
                    <span className="font-medium">{formattedBasePrice}</span>
                  </p>
                )}
                {(requiresBase || requiresIp || requiresCredentials) && (
                  <ul className="list-disc space-y-1 pl-4 text-slate-600">
                    {requiresBase && <li>Requiere una base/torre asignada.</li>}
                    {requiresIp && <li>Necesita IP de servicio y datos técnicos.</li>}
                    {requiresCredentials && (
                      <li>Captura las credenciales o notas de acceso en notas del servicio.</li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {serviceState.servicePlanId && (
              <div className="mt-2 space-y-3">
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

                  {requiresBase && (
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
              </div>
            )}

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
                      onChange={(event) => handleServiceStateChange('customPrice', event.target.value)}
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
                        onChange={(event) => handleServiceStateChange('ipAddress', event.target.value)}
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
                        onChange={(event) => handleServiceStateChange('modemIp', event.target.value)}
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
                        onChange={(event) => handleServiceStateChange('antennaIp', event.target.value)}
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
                        onChange={(event) => handleServiceStateChange('modemModel', event.target.value)}
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
                        onChange={(event) => handleServiceStateChange('antennaModel', event.target.value)}
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
