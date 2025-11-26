import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { computeServiceFormErrors } from '../../utils/serviceFormValidation.js'
import { isCourtesyPrice, resolveEffectivePriceForFormState } from '../../utils/effectivePrice.js'
import { formatServicePlanLabel, planRequiresIp } from '../../utils/servicePlanMetadata.js'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'suspended', label: 'Suspendido' },
  { value: 'courtesy', label: 'Gratis / Cortesía' },
]

const createDefaultFormState = () => ({
  servicePlanId: '',
  status: 'active',
  billingDay: '',
  baseId: '',
  useClientBase: true,
  isCustomPriceEnabled: false,
  price: '',
  notes: '',
})

export default function BulkAssignServicesModal({
  isOpen,
  onClose,
  onSubmit,
  isProcessing = false,
  clients = [],
  servicePlans = [],
}) {
  const [formState, setFormState] = useState(() => createDefaultFormState())
  const [errors, setErrors] = useState({})

  const activePlans = useMemo(
    () => servicePlans.filter((plan) => plan.isActive !== false),
    [servicePlans],
  )

  const selectedPlan = useMemo(() => {
    if (!formState.servicePlanId) {
      return null
    }
    return (
      activePlans.find((plan) => String(plan.id) === String(formState.servicePlanId)) ?? null
    )
  }, [activePlans, formState.servicePlanId])

  const effectivePrice = useMemo(
    () => resolveEffectivePriceForFormState(formState, selectedPlan),
    [formState, selectedPlan],
  )
  const isCourtesyMode = formState.status === 'courtesy'
  const isCourtesyPriceSelection = useMemo(
    () => isCourtesyPrice(effectivePrice),
    [effectivePrice],
  )
  const isCourtesy = useMemo(
    () => isCourtesyMode || isCourtesyPriceSelection,
    [isCourtesyMode, isCourtesyPriceSelection],
  )

  useEffect(() => {
    if (!isOpen) {
      setFormState(createDefaultFormState())
      setErrors({})
    }
  }, [isOpen])

  useEffect(() => {
    if (!isCourtesy) {
      return
    }
    setFormState((prev) => {
      if (prev.billingDay === '' || prev.billingDay === null) {
        return prev
      }
      return { ...prev, billingDay: '' }
    })
  }, [isCourtesy])

  const selectedCount = clients.length
  const selectedClientNames = useMemo(
    () =>
      clients
        .map((client) => client?.name ?? 'Cliente')
        .filter(Boolean)
        .slice(0, 5),
    [clients],
  )

  const planOptions = useMemo(
    () =>
      activePlans
        .map((plan) => ({ value: String(plan.id), label: formatServicePlanLabel(plan) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })),
    [activePlans],
  )

  const planRequiresUniqueIp = useMemo(
    () => planRequiresIp(selectedPlan),
    [selectedPlan],
  )

  if (!isOpen) {
    return null
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const validationErrors = computeServiceFormErrors(
      {
        ...formState,
        price: formState.isCustomPriceEnabled ? formState.price : '',
      },
      { plan: selectedPlan, effectivePrice },
    )

    if (!formState.servicePlanId) {
      validationErrors.servicePlanId = 'Selecciona un servicio mensual.'
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    const normalizedPlanId = Number(formState.servicePlanId)
    if (!Number.isFinite(normalizedPlanId) || normalizedPlanId <= 0) {
      setErrors({ servicePlanId: 'Selecciona un servicio mensual válido.' })
      return
    }

    if (planRequiresUniqueIp) {
      setErrors((prev) => ({
        ...prev,
        form:
          'Este plan requiere asignar una IP distinta por cliente. Asigna el servicio de forma individual o utiliza la importación masiva con IPs predefinidas.',
      }))
      return
    }

    const clientIds = clients
      .map((client) => String(client?.id ?? client?.clientId ?? ''))
      .filter((id) => id)

    const isCourtesySelection = formState.status === 'courtesy'

    const shouldUseClientZone = formState.useClientBase !== false

    const payload = {
      serviceId: normalizedPlanId,
      clientIds,
      initialState: isCourtesySelection ? 'active' : formState.status || 'active',
      useClientZone: shouldUseClientZone,
      baseId: shouldUseClientZone ? null : undefined,
    }

    if (isCourtesySelection) {
      payload.customPrice = 0
    } else if (formState.isCustomPriceEnabled) {
      const parsedPrice = Number(formState.price)
      if (Number.isFinite(parsedPrice)) {
        payload.customPrice = parsedPrice
      }
    }

    if (!isCourtesy && formState.billingDay !== '' && formState.billingDay !== null) {
      const parsedDay = Number(formState.billingDay)
      if (Number.isInteger(parsedDay) && parsedDay >= 1 && parsedDay <= 31) {
        payload.billingDay = parsedDay
      }
    }

    if (formState.baseId !== '' && formState.baseId !== null) {
      const parsedBase = Number(formState.baseId)
      if (Number.isInteger(parsedBase) && parsedBase > 0) {
        payload.baseId = parsedBase
      }
    }

    if (formState.notes?.trim()) {
      payload.notes = formState.notes.trim()
    }

    onSubmit(payload)
  }

  const handlePlanChange = (event) => {
    const nextPlanId = event.target.value
    const planForNext =
      activePlans.find((plan) => String(plan.id) === String(nextPlanId)) ?? null
    setFormState((prev) => {
      const shouldForceCourtesy = prev.status === 'courtesy'
      if (shouldForceCourtesy) {
        return {
          ...prev,
          servicePlanId: nextPlanId,
          isCustomPriceEnabled: true,
          price: '0',
        }
      }

      const nextSuggestedPrice = planForNext
        ? planForNext.defaultMonthlyFee ?? planForNext.monthlyPrice ?? ''
        : ''

      const nextPrice = prev.isCustomPriceEnabled
        ? prev.price
        : nextSuggestedPrice

      return {
        ...prev,
        servicePlanId: nextPlanId,
        isCustomPriceEnabled: prev.isCustomPriceEnabled,
        price: nextPrice,
      }
    })
    setErrors((prev) => ({ ...prev, servicePlanId: undefined, price: undefined, form: undefined }))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-3xl max-h-[min(100vh-2rem,720px)] flex-col overflow-hidden rounded-lg bg-white shadow-xl"
      >
        <header className="flex flex-shrink-0 items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Edición masiva de servicios</h2>
            <p className="mt-1 text-sm text-slate-500">
              Selecciona un plan mensual y aplícalo a los clientes elegidos. Se validarán bases, IPs y cupos
              antes de guardar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Cerrar"
            disabled={isProcessing}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-700">
                {selectedCount === 1
                  ? '1 cliente seleccionado'
                  : `${selectedCount} clientes seleccionados`}
              </p>
              {selectedClientNames.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  {selectedClientNames.join(', ')}
                  {selectedCount > selectedClientNames.length ? '…' : ''}
                </p>
              )}
            </div>

            {planRequiresUniqueIp && selectedPlan ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">No disponible para asignación masiva</p>
                <p className="mt-1">
                  Este plan requiere registrar una dirección IP distinta por cliente. Gestiona el servicio desde
                  la ficha individual de cada cliente o importa un archivo CSV con las IPs asignadas previamente.
                </p>
              </div>
            ) : null}

            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              <span>Servicio mensual</span>
              <select
                value={formState.servicePlanId}
                onChange={handlePlanChange}
                className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                  errors.servicePlanId
                    ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                    : 'border-slate-300'
                }`}
                disabled={isProcessing}
              >
                <option value="">Selecciona un servicio mensual</option>
                {planOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {errors.servicePlanId && (
                <span className="text-xs font-medium text-red-600">{errors.servicePlanId}</span>
              )}
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span>Estado inicial</span>
                <select
                  value={formState.status}
                  onChange={(event) => {
                    const nextStatus = event.target.value
                    setFormState((prev) => {
                      if (nextStatus === 'courtesy') {
                        return {
                          ...prev,
                          status: nextStatus,
                          isCustomPriceEnabled: true,
                          price: '0',
                          billingDay: '',
                        }
                      }

                      const shouldKeepCustomPrice = Boolean(
                        prev.isCustomPriceEnabled && prev.price !== '' && prev.price !== null,
                      )

                      return {
                        ...prev,
                        status: nextStatus,
                        isCustomPriceEnabled: shouldKeepCustomPrice,
                        price: shouldKeepCustomPrice && prev.price !== '0' ? prev.price : '',
                      }
                    })
                    setErrors((prevErrors) => ({
                      ...prevErrors,
                      status: undefined,
                      price: undefined,
                      billingDay: undefined,
                    }))
                  }}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                  disabled={isProcessing}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span>Día de cobro (1-31)</span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={formState.billingDay}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, billingDay: event.target.value }))
                  }
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    errors.billingDay
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  } ${isCourtesy ? 'bg-slate-100 text-slate-500' : ''}`}
                  disabled={isProcessing || isCourtesy}
                  placeholder={isCourtesy ? 'No aplica para cortesía' : '15'}
                />
                {errors.billingDay && (
                  <span className="text-xs font-medium text-red-600">{errors.billingDay}</span>
                )}
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span>Base asignada (opcional)</span>
                  <input
                    value={formState.baseId}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      setFormState((prev) => ({
                        ...prev,
                        baseId: nextValue,
                        useClientBase: false,
                      }))
                      setErrors((prev) => ({ ...prev, baseId: undefined }))
                    }}
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                      errors.baseId
                        ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                        : 'border-slate-300'
                    } ${
                      formState.useClientBase ? 'bg-slate-100 text-slate-500' : ''
                    }`}
                    placeholder="Selecciona una base manual"
                    disabled={isProcessing || formState.useClientBase}
                  />
                </label>
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={formState.useClientBase}
                      onChange={(event) => {
                        const shouldUseClientBase = event.target.checked
                        setFormState((prev) => ({
                          ...prev,
                          useClientBase: shouldUseClientBase,
                          baseId: shouldUseClientBase ? '' : prev.baseId,
                        }))
                        if (shouldUseClientBase) {
                          setErrors((prev) => ({ ...prev, baseId: undefined }))
                        }
                      }}
                      disabled={isProcessing}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-blue-500"
                    />
                    <span>Usar zona del cliente</span>
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Mantén activada esta opción para respetar la zona configurada en cada cliente.
                    Desmárcala si quieres asignar una base específica.
                  </p>
                  {errors.baseId && (
                    <span className="block text-xs font-medium text-red-600">{errors.baseId}</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formState.isCustomPriceEnabled}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        isCustomPriceEnabled: event.target.checked,
                        price: event.target.checked ? prev.price : '',
                      }))
                    }
                    disabled={isProcessing || isCourtesyMode}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-blue-500"
                  />
                  <span>Usar tarifa personalizada</span>
                </label>
                <input
                  value={formState.price}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, price: event.target.value }))
                  }
                  className={`w-full rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    errors.price
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  } ${
                    !formState.isCustomPriceEnabled || isCourtesyMode
                      ? 'bg-slate-100 text-slate-500'
                      : ''
                  }`}
                  placeholder={selectedPlan ? `Tarifa sugerida: ${formatPlanLabel(selectedPlan)}` : '300'}
                  disabled={isProcessing || !formState.isCustomPriceEnabled || isCourtesyMode}
                />
                {errors.price && (
                  <span className="text-xs font-medium text-red-600">{errors.price}</span>
                )}
              </div>
            </div>

            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              <span>Notas internas (opcional)</span>
              <textarea
                value={formState.notes}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, notes: event.target.value }))
                }
                className="min-h-[80px] rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                placeholder="Ejemplo: Asignación tras importación"
                disabled={isProcessing}
              />
            </label>
          </div>

        </div>

        <footer className="flex flex-shrink-0 flex-col gap-3 border-t border-slate-200 px-6 py-4 md:flex-row md:items-center md:justify-end">
          {errors.form ? (
            <p className="text-sm font-medium text-red-600 md:mr-auto">{errors.form}</p>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isProcessing || selectedCount === 0 || planRequiresUniqueIp}>
            {isProcessing ? 'Aplicando…' : 'Aplicar cambios'}
          </Button>
        </footer>
      </form>
    </div>
  )
}
