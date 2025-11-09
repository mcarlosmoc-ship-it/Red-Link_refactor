import React, { useEffect, useMemo, useState } from 'react'
import {
  peso,
  formatDate,
  formatPeriodLabel,
  getPeriodFromDateString,
  today,
} from '../utils/formatters.js'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { useBackofficeStore } from '../store/useBackofficeStore.js'
import { usePayments } from '../hooks/usePayments.js'
import { useToast } from '../hooks/useToast.js'
import { useClients } from '../hooks/useClients.js'
import { useBackofficeRefresh } from '../contexts/BackofficeRefreshContext.jsx'
import PaymentsSkeleton from './PaymentsSkeleton.jsx'

const METHODS = ['Todos', 'Efectivo', 'Transferencia', 'Tarjeta', 'Revendedor']
const METHOD_OPTIONS = METHODS.filter((method) => method !== 'Todos')

export default function PaymentsPage() {
  const { selectedPeriod, recordPayment, initializeStatus } = useBackofficeStore((state) => ({
    selectedPeriod: state.periods?.selected ?? state.periods?.current,
    recordPayment: state.recordPayment,
    initializeStatus: state.status.initialize,
  }))
  const { payments, status: paymentsStatus, reload } = usePayments({ periodKey: selectedPeriod })
  const { showToast } = useToast()
  const { clients, status: clientsStatus } = useClients()
  const { isRefreshing } = useBackofficeRefresh()
  const [methodFilter, setMethodFilter] = useState('Todos')
  const [searchTerm, setSearchTerm] = useState('')
  const [isRetrying, setIsRetrying] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    clientId: '',
    serviceId: '',
    months: '',
    amount: '',
    method: METHOD_OPTIONS[0] ?? 'Efectivo',
    note: '',
    paidOn: today(),
  })
  const [paymentError, setPaymentError] = useState(null)
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false)

  const isLoadingPayments = Boolean(paymentsStatus?.isLoading && payments.length === 0)
  const isSyncingPayments = Boolean(paymentsStatus?.isLoading)
  const hasPaymentsError = Boolean(paymentsStatus?.error)
  const isLoadingClients = Boolean(clientsStatus?.isLoading && clients.length === 0)
  const shouldShowSkeleton = Boolean(initializeStatus?.isLoading) || isRefreshing

  if (shouldShowSkeleton) {
    return <PaymentsSkeleton />
  }

  const clientOptions = useMemo(
    () =>
      [...clients]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((client) => ({
          value: client.id,
          label: `${client.name} · Base ${client.base} · ${client.location}`,
        })),
    [clients],
  )

  const selectedClient = useMemo(
    () => clients.find((client) => String(client.id) === String(paymentForm.clientId)) ?? null,
    [clients, paymentForm.clientId],
  )

  const serviceOptions = useMemo(() => {
    if (!selectedClient) {
      return []
    }
    return (selectedClient.services ?? []).map((service) => ({
      value: String(service.id),
      label: `${service.name} · ${(service.type || 'servicio').replace(/_/g, ' ')}`,
    }))
  }, [selectedClient])

  useEffect(() => {
    if (!selectedClient?.services?.length) {
      setPaymentForm((prev) => (prev.serviceId === '' ? prev : { ...prev, serviceId: '' }))
      return
    }

    const hasCurrentService = selectedClient.services.some(
      (service) => String(service.id) === String(paymentForm.serviceId),
    )

    if (hasCurrentService) {
      return
    }

    const defaultServiceId = String(selectedClient.services[0].id)
    setPaymentForm((prev) => ({ ...prev, serviceId: defaultServiceId }))
  }, [selectedClient, paymentForm.serviceId])

  const selectedService = useMemo(() => {
    if (!selectedClient?.services?.length) {
      return null
    }

    return (
      selectedClient.services.find(
        (service) => String(service.id) === String(paymentForm.serviceId),
      ) ?? selectedClient.services[0] ?? null
    )
  }, [selectedClient, paymentForm.serviceId])

  const selectedServiceStatusLabel = useMemo(() => {
    if (!selectedService) {
      return null
    }

    switch (selectedService.status) {
      case 'active':
        return 'Activo'
      case 'suspended':
        return 'Suspendido'
      case 'cancelled':
        return 'Baja'
      default:
        return 'Desconocido'
    }
  }, [selectedService])

  const selectedServicePrice = useMemo(() => {
    if (!selectedService) {
      return 0
    }
    const parsed = Number(selectedService.price)
    return Number.isFinite(parsed) ? parsed : 0
  }, [selectedService])

  const handlePaymentSubmit = async (event) => {
    event.preventDefault()
    if (!paymentForm.clientId) {
      setPaymentError('Selecciona un cliente para registrar el pago.')
      return
    }

    if (!selectedService) {
      setPaymentError('El cliente no tiene servicios disponibles para cobrar.')
      return
    }

    const monthsValue = Number(paymentForm.months)
    const amountValue = Number(paymentForm.amount)
    const normalizedMonths = Number.isFinite(monthsValue) && monthsValue > 0 ? monthsValue : 0
    const normalizedAmount = Number.isFinite(amountValue) && amountValue > 0 ? amountValue : 0
    const requiresExplicitMonths = selectedServicePrice <= 0 && normalizedAmount <= 0

    if (normalizedMonths <= 0 && normalizedAmount <= 0) {
      setPaymentError('Ingresa meses pagados o un monto a registrar.')
      return
    }

    if (requiresExplicitMonths && normalizedMonths <= 0) {
      setPaymentError(
        'Este cliente no tiene una tarifa mensual configurada. Ingresa los meses cubiertos.',
      )
      return
    }

    setPaymentError(null)
    setIsSubmittingPayment(true)

    try {
      await recordPayment({
        clientId: paymentForm.clientId,
        serviceId: selectedService.id,
        months: normalizedMonths,
        amount: normalizedAmount,
        method: paymentForm.method,
        note: paymentForm.note.trim(),
        periodKey: selectedPeriod,
        paidOn: paymentForm.paidOn || today(),
      })

      showToast({
        type: 'success',
        title: 'Pago registrado',
        description: 'La cobranza se actualizó correctamente.',
      })

      setPaymentForm((prev) => ({
        ...prev,
        months: '',
        amount: '',
        note: '',
      }))
    } catch (error) {
      const message = error?.message ?? 'No se pudo registrar el pago. Intenta nuevamente.'
      setPaymentError(message)
      showToast({
        type: 'error',
        title: 'No se pudo registrar el pago',
        description: message,
      })
    } finally {
      setIsSubmittingPayment(false)
    }
  }

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      await reload()
      showToast({
        type: 'success',
        title: 'Pagos sincronizados',
        description: 'Los registros se actualizaron correctamente.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudieron cargar los pagos',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    } finally {
      setIsRetrying(false)
    }
  }

  const periodLabel = formatPeriodLabel(selectedPeriod)

  const filteredPayments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const isInSelectedPeriod = (date) => {
      const period = getPeriodFromDateString(date)
      if (!period) return false
      return Array.isArray(period) ? period.includes(selectedPeriod) : period === selectedPeriod
    }
    return payments
      .filter((payment) => isInSelectedPeriod(payment.date))
      .filter((payment) => {
        const matchesMethod = methodFilter === 'Todos' || payment.method === methodFilter
        const clientName = payment.clientName?.toLowerCase?.() ?? ''
        const note = payment.note?.toLowerCase?.() ?? ''
        const serviceName = payment.serviceName?.toLowerCase?.() ?? ''
        const matchesTerm =
          term.length === 0 || clientName.includes(term) || note.includes(term) || serviceName.includes(term)
        return matchesMethod && matchesTerm
      })
  }, [payments, methodFilter, searchTerm, selectedPeriod])

  const totalAmount = filteredPayments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0)

  return (
    <div className="space-y-6">
      <section aria-labelledby="registrar-pago" className="space-y-4">
        <div>
          <h2 id="registrar-pago" className="text-lg font-semibold text-slate-900">
            Registrar pago
          </h2>
          <p className="text-sm text-slate-500">
            Actualiza la cobranza manualmente registrando pagos por cliente, monto o meses cubiertos.
          </p>
        </div>

        <Card>
          <CardContent>
            <form className="space-y-4" onSubmit={handlePaymentSubmit}>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-xs font-medium text-slate-600 md:col-span-2">
                  Cliente
                  <select
                    value={paymentForm.clientId}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({
                        ...prev,
                        clientId: event.target.value,
                        serviceId: '',
                      }))
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    disabled={isLoadingClients}
                  >
                    <option value="">
                      {isLoadingClients ? 'Cargando clientes…' : 'Selecciona un cliente'}
                    </option>
                    {clientOptions.map((client) => (
                      <option key={client.value} value={client.value}>
                        {client.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Fecha de pago
                  <input
                    type="date"
                    value={paymentForm.paidOn}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, paidOn: event.target.value }))
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-xs font-medium text-slate-600 md:col-span-2">
                  Servicio
                  <select
                    value={paymentForm.serviceId}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, serviceId: event.target.value }))
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    disabled={!serviceOptions.length}
                  >
                    <option value="">
                      {selectedClient
                        ? serviceOptions.length
                          ? 'Selecciona un servicio'
                          : 'Este cliente no tiene servicios disponibles'
                        : 'Selecciona primero un cliente'}
                    </option>
                    {serviceOptions.map((service) => (
                      <option key={service.value} value={service.value}>
                        {service.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {selectedService ? (
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-700">{selectedService.name}</p>
                      <p className="capitalize text-slate-500">
                        {selectedService.type.replace(/_/g, ' ')} · Estado: {selectedServiceStatusLabel}
                      </p>
                      {selectedServicePrice > 0 && (
                        <p className="text-slate-500">
                          Tarifa: {peso(selectedServicePrice)} al mes
                        </p>
                      )}
                      {selectedService.nextBillingDate ? (
                        <p className="text-slate-500">
                          Próximo cobro: {formatDate(selectedService.nextBillingDate)}
                        </p>
                      ) : selectedService.billingDay ? (
                        <p className="text-slate-500">
                          Cobro recurrente día {selectedService.billingDay}
                        </p>
                      ) : (
                        <p className="text-slate-500">Sin fecha de cobro configurada</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-500">Selecciona un cliente y servicio para ver el detalle.</p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Meses pagados
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={paymentForm.months}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, months: event.target.value }))
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="0"
                    disabled={!selectedService}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Monto recibido (MXN)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="0.00"
                    disabled={!selectedService}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Método
                  <select
                    value={paymentForm.method}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, method: event.target.value }))
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {METHOD_OPTIONS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Nota (opcional)
                <textarea
                  value={paymentForm.note}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                  className="min-h-[80px] rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Referencia, folio o comentarios relevantes"
                  disabled={!selectedService}
                />
              </label>

              {paymentError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {paymentError}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isSubmittingPayment || isLoadingClients || !selectedService}
                >
                  {isSubmittingPayment ? 'Guardando…' : 'Registrar pago'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="pagos" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="pagos" className="text-lg font-semibold text-slate-900">
              Pagos registrados
            </h2>
            <p className="text-sm text-slate-500">
              Filtra por método de cobro o busca notas para auditar movimientos recientes.
            </p>
            <p className="text-xs text-slate-500">Periodo seleccionado: {periodLabel}</p>
          </div>
          <div className="flex flex-col items-end gap-1 text-sm font-medium text-slate-600">
            <span>Total filtrado: {peso(totalAmount)}</span>
            <span className="text-xs font-normal text-slate-500">Datos de {periodLabel}</span>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Método de pago
                <select
                  value={methodFilter}
                  onChange={(event) => setMethodFilter(event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Buscar
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Cliente o nota"
                  type="search"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>

            {isLoadingPayments && (
              <div
                role="status"
                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700"
              >
                Cargando pagos del periodo…
              </div>
            )}
            {!isLoadingPayments && isSyncingPayments && (
              <div
                role="status"
                className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-600"
              >
                Sincronizando movimientos recientes…
              </div>
            )}
            {hasPaymentsError && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                <span>No se pudieron cargar los pagos. Intenta nuevamente.</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="border border-red-200 bg-white text-red-700 hover:border-red-300"
                  onClick={handleRetry}
                  disabled={isRetrying}
                >
                  {isRetrying ? 'Reintentando…' : 'Reintentar'}
                </Button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Fecha
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Cliente
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Servicio
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Periodos
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Método
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Monto
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Nota
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-3 py-2 text-slate-600">{payment.date}</td>
                      <td className="px-3 py-2 text-slate-700">{payment.clientName}</td>
                      <td className="px-3 py-2 text-slate-600">{payment.serviceName}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {payment.months ? `${payment.months} mes(es)` : '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{payment.method}</td>
                      <td className="px-3 py-2 text-slate-600">{peso(payment.amount)}</td>
                      <td className="px-3 py-2 text-slate-500">{payment.note || '—'}</td>
                    </tr>
                  ))}
                  {filteredPayments.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                        No hay pagos registrados con los criterios seleccionados en {periodLabel}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
