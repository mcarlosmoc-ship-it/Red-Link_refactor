/* global fetch, Blob, URL */

import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { peso, formatPeriodLabel, getPeriodFromDateString } from '../utils/formatters.js'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { useBackofficeStore } from '../store/useBackofficeStore.js'
import { usePayments } from '../hooks/usePayments.js'
import { useToast } from '../hooks/useToast.js'
import { useClients } from '../hooks/useClients.js'
import { useBackofficeRefresh } from '../contexts/BackofficeRefreshContext.jsx'
import { apiClient, buildApiUrl } from '../services/apiClient.js'
import PaymentsSkeleton from './PaymentsSkeleton.jsx'
import FormField from '../components/ui/FormField.jsx'
import { resolveApiErrorMessage } from '../features/clients/utils.js'

const METHODS = ['Todos', 'Efectivo', 'Transferencia', 'Tarjeta', 'Revendedor']
const METHOD_OPTIONS = METHODS.filter((method) => method !== 'Todos')
const PAGE_SIZE_OPTIONS = [10, 25, 50]
const monthCountFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })

const formatMonthsForUi = (value) => {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null
  }

  if (numericValue < 1) {
    return 'Pago parcial'
  }

  const wholeMonths = Math.max(1, Math.round(numericValue))
  return `${monthCountFormatter.format(wholeMonths)} mes${wholeMonths === 1 ? '' : 'es'}`
}

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
  const [searchParams] = useSearchParams()

  const [methodFilter, setMethodFilter] = useState('Todos')
  const [searchTerm, setSearchTerm] = useState('')
  const [isRetrying, setIsRetrying] = useState(false)

  const [paymentForm, setPaymentForm] = useState({
    clientId: '',
    amount: '',
    method: METHOD_OPTIONS[0] ?? 'Efectivo',
    note: '',
  })
  const [serviceId, setServiceId] = useState('')
  const [paymentError, setPaymentError] = useState(null)
  const [paymentFieldErrors, setPaymentFieldErrors] = useState({})
  const [previewResult, setPreviewResult] = useState(null)
  const [pendingPayment, setPendingPayment] = useState(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0])

  const isLoadingPayments = Boolean(paymentsStatus?.isLoading && payments.length === 0)
  const isSyncingPayments = Boolean(paymentsStatus?.isLoading)
  const hasPaymentsError = Boolean(paymentsStatus?.error)
  const isLoadingClients = Boolean(clientsStatus?.isLoading && clients.length === 0)
  const shouldShowSkeleton = Boolean(initializeStatus?.isLoading) || isRefreshing
  const isSubmittingPayment = isPreviewing || isConfirming

  const billableClients = useMemo(
    () => clients.filter((client) => (client.services ?? []).some((service) => service.status !== 'cancelled')),
    [clients],
  )

  const clientOptions = useMemo(
    () =>
      [...billableClients]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((client) => ({
          value: client.id,
          label: `${client.name}${client.base ? ` · Base ${client.base}` : ''}${
            client.location ? ` · ${client.location}` : ''
          }`,
        })),
    [billableClients],
  )

  const selectedClient = useMemo(
    () =>
      billableClients.find((client) => String(client.id) === String(paymentForm.clientId)) ?? null,
    [billableClients, paymentForm.clientId],
  )

  useEffect(() => {
    const clientIdFromParams = searchParams.get('clientId')
    if (!clientIdFromParams || paymentForm.clientId) return

    const matchingClient = billableClients.find(
      (client) => String(client.id) === String(clientIdFromParams),
    )

    if (matchingClient) {
      setPaymentForm((prev) => ({ ...prev, clientId: String(matchingClient.id) }))
    }
  }, [billableClients, paymentForm.clientId, searchParams])

  useEffect(() => {
    if (!selectedClient?.services?.length) {
      setServiceId('')
      return
    }

    const defaultServiceId = String(selectedClient.services[0].id)
    setServiceId(defaultServiceId)
  }, [selectedClient])

  const selectedService = useMemo(() => {
    if (!selectedClient?.services?.length) {
      return null
    }

    return (
      selectedClient.services.find((service) => String(service.id) === String(serviceId)) ??
      selectedClient.services[0] ??
      null
    )
  }, [selectedClient, serviceId])

  const validatePaymentForm = (formData, service = selectedService) => {
    const errors = {}
    if (!formData.clientId) {
      errors.clientId = 'Selecciona un cliente para registrar el pago.'
    }

    if (!service) {
      errors.serviceId = 'El cliente debe tener al menos un servicio activo.'
    }

    const amountValue = Number(formData.amount)
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      errors.amount = 'Ingresa un monto mayor a cero.'
    }

    return errors
  }

  useEffect(() => {
    setPaymentFieldErrors(validatePaymentForm(paymentForm))
  }, [paymentForm, selectedService])

  const handlePaymentFieldChange = (field, value) => {
    setPaymentForm((prev) => {
      const nextForm = {
        ...prev,
        [field]: value,
      }

      if (field === 'clientId') {
        return { ...nextForm, amount: '', note: '' }
      }

      return nextForm
    })
    setPaymentError(null)
  }

  const handlePaymentSubmit = async (event) => {
    event.preventDefault()
    const validationErrors = validatePaymentForm(paymentForm, selectedService)
    setPaymentFieldErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) {
      setPaymentError('Corrige los campos marcados antes de guardar.')
      return
    }

    if (!selectedService) {
      setPaymentError('El cliente seleccionado no tiene servicios configurados para pagos.')
      return
    }

    setIsPreviewing(true)
    const payload = {
      client_service_id: selectedService.id,
      amount: Number(paymentForm.amount),
      method: paymentForm.method,
      note: paymentForm.note?.trim?.() || undefined,
    }

    try {
      const response = await apiClient.post('/payments/preview', payload)
      setPreviewResult(response.data)
      setPendingPayment(payload)
      setPaymentError(null)
    } catch (error) {
      const message = resolveApiErrorMessage(error, 'No se pudo previsualizar el pago.')
      setPaymentError(message)
      showToast({
        type: 'error',
        title: 'No se pudo previsualizar el pago',
        description: message,
      })
    } finally {
      setIsPreviewing(false)
    }
  }

  const resetPreview = () => {
    setPreviewResult(null)
    setPendingPayment(null)
  }

  const handleConfirmPayment = async () => {
    if (!pendingPayment || !selectedClient) return
    setIsConfirming(true)
    try {
      await recordPayment({
        clientId: paymentForm.clientId,
        serviceId: pendingPayment.client_service_id,
        amount: pendingPayment.amount,
        method: pendingPayment.method,
        note: paymentForm.note?.trim?.() || '',
        periodKey: selectedPeriod,
      })

      showToast({
        type: 'success',
        title: 'Pago registrado',
        description: previewResult?.message ?? 'Pago guardado.',
      })

      const nextForm = { ...paymentForm, amount: '', note: '' }
      setPaymentForm(nextForm)
      setPaymentFieldErrors(validatePaymentForm(nextForm))
      resetPreview()
    } catch (error) {
      const message = resolveApiErrorMessage(error, 'No se pudo registrar el pago.')
      setPaymentError(message)
      showToast({
        type: 'error',
        title: 'No se pudo registrar el pago',
        description: message,
      })
    } finally {
      setIsConfirming(false)
    }
  }

  const handlePrintReceipt = async (paymentId) => {
    try {
      const url = buildApiUrl(`/payments/${paymentId}/receipt`)
      const token = apiClient.getAccessToken?.()
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!response.ok) {
        throw new Error('No se pudo generar el recibo')
      }

      const html = await response.text()
      const receiptWindow = window.open('', '_blank', 'noopener,noreferrer')

      if (!receiptWindow) {
        throw new Error('No se pudo abrir la ventana de impresión')
      }

      receiptWindow.document.open()
      receiptWindow.document.write(html)
      receiptWindow.document.close()

      showToast({
        type: 'success',
        title: 'Recibo listo',
        description: 'Se abrió la ventana de impresión.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo imprimir',
        description: error?.message ?? 'Intenta nuevamente o verifica tu conexión.',
      })
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

  useEffect(() => {
    setCurrentPage(1)
  }, [methodFilter, searchTerm, selectedPeriod, payments.length, pageSize])

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / pageSize))

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  )

  const totalAmount = filteredPayments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0)

  if (shouldShowSkeleton) {
    return <PaymentsSkeleton />
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="registrar-pago" className="space-y-4">
        <div>
          <h2 id="registrar-pago" className="text-lg font-semibold text-slate-900">
            Registrar pago
          </h2>
          <p className="text-sm text-slate-500">
            Flujo simplificado: elige cliente, monto, método y confirma antes de guardar.
          </p>
        </div>

        <Card>
          <CardContent>
            <form className="space-y-4" onSubmit={handlePaymentSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField
                  label="Cliente"
                  htmlFor="payment-client"
                  status={paymentFieldErrors.clientId ? 'error' : paymentForm.clientId ? 'success' : 'default'}
                  message={
                    paymentFieldErrors.clientId ??
                    (isLoadingClients
                      ? 'Cargando clientes…'
                      : 'Selecciona a quién se registrará el cobro.')
                  }
                >
                  <select
                    id="payment-client"
                    value={paymentForm.clientId}
                    onChange={(event) => handlePaymentFieldChange('clientId', event.target.value)}
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
                </FormField>
                <FormField
                  label="Monto recibido (MXN)"
                  htmlFor="payment-amount"
                  status={paymentFieldErrors.amount ? 'error' : paymentForm.amount ? 'success' : 'default'}
                  message={paymentFieldErrors.amount ?? 'Registra el total recibido.'}
                >
                  <input
                    id="payment-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(event) => handlePaymentFieldChange('amount', event.target.value)}
                    placeholder="0.00"
                    disabled={!selectedService}
                  />
                </FormField>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <FormField
                  label="Método"
                  htmlFor="payment-method"
                  status="default"
                  message="Define el método para auditoría."
                >
                  <select
                    id="payment-method"
                    value={paymentForm.method}
                    onChange={(event) => handlePaymentFieldChange('method', event.target.value)}
                  >
                    {METHOD_OPTIONS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  label="Nota (opcional)"
                  htmlFor="payment-note"
                  status={paymentForm.note ? 'success' : 'default'}
                  message={
                    paymentForm.note
                      ? 'Se guardará como referencia del movimiento.'
                      : 'Agrega referencias o comentarios relevantes.'
                  }
                >
                  <textarea
                    id="payment-note"
                    value={paymentForm.note}
                    onChange={(event) => handlePaymentFieldChange('note', event.target.value)}
                    className="min-h-[80px]"
                    placeholder="Referencia, folio o comentarios relevantes"
                    disabled={!selectedService}
                  />
                </FormField>
              </div>

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
                  {isSubmittingPayment ? 'Procesando…' : 'Registrar pago'}
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
                      Cobertura
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
                    <th scope="col" className="px-3 py-2 font-medium">Recibo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-3 py-2 text-slate-600">{payment.date}</td>
                      <td className="px-3 py-2 text-slate-700">{payment.clientName}</td>
                      <td className="px-3 py-2 text-slate-600">{payment.serviceName}</td>
                      <td className="px-3 py-2 text-slate-600">
                        <div className="flex flex-col">
                          <span>{formatPeriodLabel(getPeriodFromDateString(payment.date)) || 'Periodo sin definir'}</span>
                          <span className="text-xs text-slate-500">
                            {formatMonthsForUi(payment.months) ??
                              (Number(payment.months) >= 1
                                ? 'Mensualidad cubierta'
                                : 'Pago parcial / saldo pendiente')}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{payment.method}</td>
                      <td className="px-3 py-2 text-slate-600">{peso(payment.amount)}</td>
                      <td className="px-3 py-2 text-slate-500">{payment.note || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          onClick={() => handlePrintReceipt(payment.id)}
                        >
                          Imprimir
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {paginatedPayments.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500">
                        No hay pagos registrados con los criterios seleccionados en {periodLabel}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  Filas por página
                  <select
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-xs text-slate-500">
                  Mostrando {paginatedPayments.length} de {filteredPayments.length} registros
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <span className="text-xs font-medium text-slate-700">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {previewResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Confirmar pago</h3>
            <p className="mt-3 text-sm text-slate-700">{previewResult.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={resetPreview}
                disabled={isConfirming}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirmPayment}
                disabled={isConfirming}
              >
                {isConfirming ? 'Guardando…' : 'Confirmar pago'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
