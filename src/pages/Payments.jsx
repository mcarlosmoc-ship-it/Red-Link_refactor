/* global fetch, Blob, URL */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { apiClient, buildApiUrl } from '../services/apiClient.js'
import PaymentsSkeleton from './PaymentsSkeleton.jsx'
import FormField from '../components/ui/FormField.jsx'

const METHODS = ['Todos', 'Efectivo', 'Transferencia', 'Tarjeta', 'Revendedor']
const METHOD_OPTIONS = METHODS.filter((method) => method !== 'Todos')
const PAGE_SIZE_OPTIONS = [10, 25, 50]
const QUICK_MONTH_OPTIONS = [1, 2, 3]
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

const resolveCoverageLabel = ({ monthsCovered, hasOutstandingBalance }) => {
  if (!Number.isFinite(monthsCovered)) {
    return 'Sin tarifa definida'
  }

  if (monthsCovered >= 1) {
    return monthsCovered > 1 ? 'Mensualidad cubierta (saldo a favor)' : 'Mensualidad cubierta'
  }

  if (monthsCovered > 0) {
    return 'Pago parcial'
  }

  return hasOutstandingBalance ? 'Saldo pendiente' : 'Pago parcial'
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
    serviceId: '',
    months: '',
    amount: '',
    method: METHOD_OPTIONS[0] ?? 'Efectivo',
    note: '',
    paidOn: today(),
  })
  const [paymentError, setPaymentError] = useState(null)
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false)
  const [paymentFieldErrors, setPaymentFieldErrors] = useState({})
  const [hasAmountBeenManuallyEdited, setHasAmountBeenManuallyEdited] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0])

  const isLoadingPayments = Boolean(paymentsStatus?.isLoading && payments.length === 0)
  const isSyncingPayments = Boolean(paymentsStatus?.isLoading)
  const hasPaymentsError = Boolean(paymentsStatus?.error)
  const isLoadingClients = Boolean(clientsStatus?.isLoading && clients.length === 0)
  const shouldShowSkeleton = Boolean(initializeStatus?.isLoading) || isRefreshing

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
    const clientIdFromParams = searchParams.get('clientId')
    if (!clientIdFromParams || paymentForm.clientId) return

    const matchingClient = clients.find(
      (client) => String(client.id) === String(clientIdFromParams),
    )

    if (matchingClient) {
      setPaymentForm((prev) => ({ ...prev, clientId: String(matchingClient.id) }))
    }
  }, [clients, paymentForm.clientId, searchParams])

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

  const selectedServiceTypeLabel = useMemo(() => {
    if (!selectedService) {
      return null
    }

    const rawType = selectedService.type || selectedService.plan?.category
    if (!rawType) {
      return 'Servicio'
    }

    return String(rawType).replace(/_/g, ' ')
  }, [selectedService])

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

  const resolveOutstandingAmount = useMemo(
    () =>
      (client, service) => {
        if (!client) {
          return null
        }

        const normalizedClientDebt = Number(client.debtAmount)
        if (Number.isFinite(normalizedClientDebt) && normalizedClientDebt > 0) {
          return normalizedClientDebt
        }

        const normalizedServiceDebt = Number(service?.debtAmount)
        if (Number.isFinite(normalizedServiceDebt) && normalizedServiceDebt > 0) {
          return normalizedServiceDebt
        }

        const debtMonths = Number(service?.debtMonths ?? client.debtMonths)
        const referencePrice = Number(service?.price ?? client.monthlyFee)
        if (
          Number.isFinite(debtMonths) &&
          debtMonths > 0 &&
          Number.isFinite(referencePrice) &&
          referencePrice > 0
        ) {
          return Number((debtMonths * referencePrice).toFixed(2))
        }

        return null
      },
    [],
  )

  const resolveOutstandingMonths = useMemo(
    () =>
      (client, service) => {
        if (!client && !service) {
          return null
        }

        const normalizedClientDebtMonths = Number(client?.debtMonths)
        if (Number.isFinite(normalizedClientDebtMonths) && normalizedClientDebtMonths > 0) {
          return normalizedClientDebtMonths
        }

        const normalizedServiceDebtMonths = Number(service?.debtMonths)
        if (Number.isFinite(normalizedServiceDebtMonths) && normalizedServiceDebtMonths > 0) {
          return normalizedServiceDebtMonths
        }

        const outstandingAmount = Number(service?.debtAmount ?? client?.debtAmount)
        const referencePrice = Number(service?.price ?? client?.monthlyFee)
        if (
          Number.isFinite(outstandingAmount) &&
          outstandingAmount > 0 &&
          Number.isFinite(referencePrice) &&
          referencePrice > 0
        ) {
          const months = outstandingAmount / referencePrice
          return Number(months.toFixed(2))
        }

        return null
      },
    [],
  )

  const resolveAheadAmount = useMemo(
    () =>
      (client, service) => {
        if (!client && !service) {
          return 0
        }

        const aheadMonths = Number(service?.paidMonthsAhead ?? client?.paidMonthsAhead)
        const referencePrice = Number(service?.price ?? client?.monthlyFee)

        if (!Number.isFinite(aheadMonths) || aheadMonths <= 0) {
          return 0
        }

        if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
          return 0
        }

        return Number((aheadMonths * referencePrice).toFixed(2))
      },
    [],
  )

  const resolveSuggestedAmount = useCallback(
    (form) => {
      const client = resolveSelectedClientFromForm(form)
      const service = resolveSelectedServiceFromForm(form)

      if (!client || !service) {
        return null
      }

      const referencePrice = Number(service?.price ?? client?.monthlyFee)
      const outstandingAmount = Number(resolveOutstandingAmount(client, service) ?? 0)
      const aheadAmount = Number(resolveAheadAmount(client, service) ?? 0)

      if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
        return outstandingAmount > 0 ? outstandingAmount - aheadAmount : null
      }

      const suggested = referencePrice + outstandingAmount - aheadAmount
      return suggested > 0 ? Number(suggested.toFixed(2)) : 0
    },
    [
      resolveSelectedClientFromForm,
      resolveSelectedServiceFromForm,
      resolveOutstandingAmount,
      resolveAheadAmount,
    ],
  )

  const monthsValue = Number(paymentForm.months)
  const amountValue = Number(paymentForm.amount)
  const hasMonthsValue = Number.isFinite(monthsValue) && monthsValue > 0
  const hasAmountValue = Number.isFinite(amountValue) && amountValue > 0

  const suggestedAmountFromMonths = useMemo(() => {
    if (!selectedServicePrice || !hasMonthsValue) return null
    return selectedServicePrice * monthsValue
  }, [selectedServicePrice, hasMonthsValue, monthsValue])

  const inferredMonthsFromAmount = useMemo(() => {
    if (!selectedServicePrice || !hasAmountValue) return null
    const inferred = amountValue / selectedServicePrice
    if (!Number.isFinite(inferred) || inferred <= 0) return null
    return inferred
  }, [selectedServicePrice, hasAmountValue, amountValue])

  const outstandingAmount = useMemo(() => {
    if (!selectedClient || !selectedService) {
      return 0
    }

    return Number(resolveOutstandingAmount(selectedClient, selectedService) ?? 0)
  }, [resolveOutstandingAmount, selectedClient, selectedService])

  const aheadAmount = useMemo(() => {
    if (!selectedClient || !selectedService) {
      return 0
    }

    return Number(resolveAheadAmount(selectedClient, selectedService) ?? 0)
  }, [resolveAheadAmount, selectedClient, selectedService])

  const suggestedCharge = useMemo(
    () => resolveSuggestedAmount(paymentForm),
    [paymentForm, resolveSuggestedAmount],
  )

  const totalDue = useMemo(() => {
    const base = Number.isFinite(selectedServicePrice) && selectedServicePrice > 0 ? selectedServicePrice : 0
    const pending = Number.isFinite(outstandingAmount) && outstandingAmount > 0 ? outstandingAmount : 0
    const credit = Number.isFinite(aheadAmount) && aheadAmount > 0 ? aheadAmount : 0
    const total = base + pending - credit
    return total > 0 ? Number(total.toFixed(2)) : 0
  }, [aheadAmount, outstandingAmount, selectedServicePrice])

  const resultingBalance = useMemo(() => {
    const received = hasAmountValue ? amountValue : 0
    const balance = totalDue - received
    return Number(balance.toFixed(2))
  }, [amountValue, hasAmountValue, totalDue])

  const resultingPending = Math.max(0, resultingBalance)
  const resultingAhead = Math.max(0, -resultingBalance)

  const monthsCovered = useMemo(() => {
    if (!selectedServicePrice) {
      return Number.NaN
    }

    const effectiveContribution = (hasAmountValue ? amountValue : 0) + aheadAmount - outstandingAmount
    const covered = effectiveContribution / selectedServicePrice
    return Number.isFinite(covered) ? covered : Number.NaN
  }, [aheadAmount, amountValue, hasAmountValue, outstandingAmount, selectedServicePrice])

  const coverageLabel = resolveCoverageLabel({
    monthsCovered,
    hasOutstandingBalance: outstandingAmount > 0,
  })

  const monthsCoveredLabel = formatMonthsForUi(monthsCovered)
  const baseCoveragePeriod = getPeriodFromDateString(paymentForm.paidOn) ?? selectedPeriod ?? null
  const coveragePeriodLabel = baseCoveragePeriod ? formatPeriodLabel(baseCoveragePeriod) : null

  const resolveSelectedClientFromForm = (formData) =>
    clients.find((client) => String(client.id) === String(formData.clientId)) ?? null

  const resolveSelectedServiceFromForm = (formData) => {
    const client = resolveSelectedClientFromForm(formData)
    if (!client?.services?.length) return null
    return (
      client.services.find((service) => String(service.id) === String(formData.serviceId)) ??
      client.services[0] ??
      null
    )
  }

  const applyPaymentSuggestions = useCallback(
    (form) => {
      const client = resolveSelectedClientFromForm(form)
      const service = resolveSelectedServiceFromForm(form)

      const suggestedAmount = resolveSuggestedAmount(form)
      const suggestedMonths = resolveOutstandingMonths(client, service)

      const hasCustomMonths = Number(form.months) > 0

      const nextForm = { ...form }
      let hasUpdates = false

      if (!hasCustomMonths && Number.isFinite(suggestedMonths) && suggestedMonths > 0) {
        const normalizedSuggestedMonths = Math.max(1, Math.round(suggestedMonths))
        const normalizedSuggestedMonthsLabel = String(normalizedSuggestedMonths)
        if (form.months !== normalizedSuggestedMonthsLabel) {
          nextForm.months = normalizedSuggestedMonthsLabel
          hasUpdates = true
        }
      }

      if (
        !hasAmountBeenManuallyEdited &&
        Number.isFinite(suggestedAmount) &&
        suggestedAmount > 0 &&
        Number(form.amount) !== suggestedAmount
      ) {
        nextForm.amount = String(suggestedAmount)
        hasUpdates = true
      }

      return hasUpdates ? nextForm : form
    },
    [
      hasAmountBeenManuallyEdited,
      resolveOutstandingMonths,
      resolveSelectedClientFromForm,
      resolveSelectedServiceFromForm,
      resolveSuggestedAmount,
    ],
  )

  useEffect(() => {
    if (!selectedClient || !selectedService) {
      return
    }

    setPaymentForm((prev) => {
      const isSameClient = String(prev.clientId) === String(selectedClient.id)
      if (!isSameClient) {
        return prev
      }

      return applyPaymentSuggestions(prev)
    })
  }, [selectedClient, selectedService, applyPaymentSuggestions])

  const validatePaymentForm = (formData, service = selectedService) => {
    const errors = {}
    if (!formData.clientId) {
      errors.clientId = 'Selecciona un cliente para registrar el pago.'
    }

    if (!service) {
      errors.serviceId = 'El cliente debe tener al menos un servicio activo.'
    }

    const monthsValue = Number(formData.months)
    const amountValue = Number(formData.amount)
    const normalizedMonths = Number.isFinite(monthsValue) && monthsValue > 0 ? monthsValue : 0
    const normalizedAmount = Number.isFinite(amountValue) && amountValue > 0 ? amountValue : 0
    const requiresExplicitMonths = (Number(service?.price ?? 0) <= 0 && normalizedAmount <= 0) || false

    if (normalizedMonths <= 0 && normalizedAmount <= 0) {
      errors.amount = 'Ingresa meses pagados o un monto a registrar.'
    }

    if (service && requiresExplicitMonths && normalizedMonths <= 0) {
      errors.months = 'Define los meses cubiertos cuando no hay tarifa fija.'
    }

    return errors
  }

  const syncPaymentValidation = (nextFormData) => {
    const service = resolveSelectedServiceFromForm(nextFormData)
    setPaymentFieldErrors(validatePaymentForm(nextFormData, service))
  }

  const handlePaymentFieldChange = (field, value) => {
    setPaymentForm((prev) => {
      const nextForm = {
        ...prev,
        [field]: value,
      }

      if (field === 'clientId') {
        nextForm.serviceId = ''
        nextForm.months = ''
        nextForm.amount = ''
      }

      if (field === 'serviceId') {
        nextForm.months = ''
        if (!hasAmountBeenManuallyEdited) {
          nextForm.amount = ''
        }
      }

      if (field === 'months') {
        const normalizedMonths = Number(value)
        if (selectedServicePrice > 0 && Number.isFinite(normalizedMonths) && normalizedMonths > 0) {
          nextForm.amount = String(Number((normalizedMonths * selectedServicePrice).toFixed(2)))
        } else if (!hasAmountBeenManuallyEdited) {
          nextForm.amount = ''
        }
      }

      const formWithSuggestions = applyPaymentSuggestions(nextForm)

      syncPaymentValidation(formWithSuggestions)
      setPaymentError(null)

      return formWithSuggestions
    })

    if (field === 'amount') {
      setHasAmountBeenManuallyEdited(true)
    } else if (field === 'clientId' || field === 'serviceId' || field === 'months') {
      setHasAmountBeenManuallyEdited(false)
    }
  }

  const handlePaymentSubmit = async (event) => {
    event.preventDefault()
    const validationErrors = validatePaymentForm(paymentForm, selectedService)
    setPaymentFieldErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) {
      setPaymentError('Corrige los campos marcados antes de guardar.')
      return
    }

    const monthsValue = Number(paymentForm.months)
    const amountValue = Number(paymentForm.amount)
    const normalizedMonths = Number.isFinite(monthsValue) && monthsValue > 0 ? monthsValue : 0
    const normalizedAmount = Number.isFinite(amountValue) && amountValue > 0 ? amountValue : 0

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
        description:
          resultingAhead > 0
            ? `Saldo a favor generado: ${peso(resultingAhead)}.`
            : resultingPending > 0
              ? `Queda saldo pendiente de ${peso(resultingPending)}.`
              : 'La cobranza se actualizó correctamente.',
      })

      const nextForm = {
        ...paymentForm,
        months: '',
        amount: '',
        note: '',
      }
      setPaymentForm(nextForm)
      syncPaymentValidation(nextForm)
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

  useEffect(() => {
    syncPaymentValidation(paymentForm)
  }, [clients, paymentForm, selectedService])

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
            Actualiza la cobranza manualmente registrando pagos por cliente, monto o meses cubiertos.
          </p>
        </div>

        <Card>
          <CardContent>
            <form className="space-y-4" onSubmit={handlePaymentSubmit}>
              <div className="grid gap-3 md:grid-cols-3">
                <FormField
                  className="md:col-span-2"
                  label="Cliente"
                  htmlFor="payment-client"
                  status={paymentFieldErrors.clientId ? 'error' : paymentForm.clientId ? 'success' : 'default'}
                  message={
                    paymentFieldErrors.clientId ??
                    'Selecciona a quién se registrará el cobro.'
                  }
                  tooltip="Busca por nombre, base o ubicación para evitar errores de asignación."
                >
                  <select
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
                  label="Fecha de pago"
                  htmlFor="payment-date"
                  status={paymentForm.paidOn ? 'success' : 'default'}
                  message="Define la fecha efectiva del cobro."
                >
                  <input
                    type="date"
                    value={paymentForm.paidOn}
                    onChange={(event) => handlePaymentFieldChange('paidOn', event.target.value)}
                  />
                </FormField>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <FormField
                  className="md:col-span-2"
                  label="Servicio"
                  htmlFor="payment-service"
                  status={paymentFieldErrors.serviceId ? 'error' : paymentForm.serviceId ? 'success' : 'default'}
                  message={
                    paymentFieldErrors.serviceId ??
                    (selectedClient
                      ? 'Elige el servicio que estás cobrando.'
                      : 'Selecciona un cliente para listar servicios.')
                  }
                  tooltip="Solo se muestran los servicios activos o asignados al cliente."
                >
                  <select
                    value={paymentForm.serviceId}
                    onChange={(event) => handlePaymentFieldChange('serviceId', event.target.value)}
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
                </FormField>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 shadow-inner">
                  {selectedService ? (
                    <div className="space-y-2">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{selectedService.name}</p>
                          <p className="text-xs capitalize text-slate-500">{selectedServiceTypeLabel ?? 'Servicio'}</p>
                        </div>
                        {selectedServiceStatusLabel && (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold capitalize text-slate-700">
                            Estado: {selectedServiceStatusLabel}
                          </span>
                        )}
                      </div>

                      <dl className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                        <div className="space-y-0.5">
                          <dt className="font-semibold text-slate-700">Tarifa mensual</dt>
                          <dd>{selectedServicePrice > 0 ? `${peso(selectedServicePrice)} al mes` : 'Sin tarifa fija'}</dd>
                        </div>
                        <div className="space-y-0.5">
                          <dt className="font-semibold text-slate-700">Cobro recurrente</dt>
                          <dd>
                            {selectedService.nextBillingDate
                              ? `Próximo cobro: ${formatDate(selectedService.nextBillingDate)}`
                              : selectedService.billingDay
                                ? `Cobro el día ${selectedService.billingDay} de cada mes`
                                : 'Sin fecha de cobro configurada'}
                          </dd>
                        </div>
                      </dl>

                      <p className="text-[11px] text-slate-500">
                        Usa la cantidad de meses para calcular automáticamente el monto según la tarifa.
                      </p>
                    </div>
                  ) : (
                    <p className="text-slate-500">Selecciona un cliente y servicio para ver el detalle.</p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <FormField
                  label="Meses pagados"
                  htmlFor="payment-months"
                  status={paymentFieldErrors.months ? 'error' : hasMonthsValue ? 'success' : 'default'}
                  message={
                    paymentFieldErrors.months ??
                    (formatMonthsForUi(inferredMonthsFromAmount)
                      ? `Equivalente aproximado a ${formatMonthsForUi(inferredMonthsFromAmount)} con tarifa ${peso(selectedServicePrice)}.`
                      : 'Selecciona los meses a cubrir; se mostrará como número entero (sin decimales).')
                  }
                  tooltip="Elige o escribe meses completos; los fraccionarios se calculan internamente."
                >
                  <div className="space-y-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={paymentForm.months}
                      onChange={(event) => handlePaymentFieldChange('months', event.target.value)}
                      placeholder="1"
                      disabled={!selectedService}
                    />
                    <div className="flex flex-wrap gap-2">
                      {QUICK_MONTH_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                          onClick={() => handlePaymentFieldChange('months', String(option))}
                          disabled={!selectedService}
                        >
                          {option === 1 ? '1 mes' : `${option} meses`}
                        </button>
                      ))}
                    </div>
                  </div>
                </FormField>
                <FormField
                  label="Monto recibido (MXN)"
                  htmlFor="payment-amount"
                  status={paymentFieldErrors.amount ? 'error' : hasAmountValue ? 'success' : 'default'}
                  message={
                    paymentFieldErrors.amount ??
                    (hasMonthsValue && selectedServicePrice > 0
                      ? `Calculado para ${formatMonthsForUi(monthsValue) ?? 'meses definidos'} con tarifa ${peso(selectedServicePrice)}. Ajusta si aplicas descuentos.`
                      : suggestedCharge
                        ? `Sugerido: ${peso(suggestedCharge)} considerando tarifa, saldos pendientes y saldo a favor.`
                        : 'Registra el total recibido en efectivo, transferencia o tarjeta.')
                  }
                  tooltip="Se registrará tal cual para reportes; incluye centavos si aplica."
                >
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(event) => handlePaymentFieldChange('amount', event.target.value)}
                    placeholder="0.00"
                    disabled={!selectedService}
                  />
                </FormField>
                <FormField
                  label="Método"
                  htmlFor="payment-method"
                  status="default"
                  message="Define el método para auditoría y conciliación."
                >
                  <select
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
              </div>

              <FormField
                label="Nota (opcional)"
                htmlFor="payment-note"
                status={paymentForm.note ? 'success' : 'default'}
                message={
                  paymentForm.note
                    ? 'Se guardará como referencia del movimiento.'
                    : 'Agrega referencias, folios o comentarios relevantes.'
                }
                tooltip="Esta nota ayuda a rastrear comprobantes o aclaraciones futuras."
              >
                <textarea
                  value={paymentForm.note}
                  onChange={(event) => handlePaymentFieldChange('note', event.target.value)}
                  className="min-h-[80px]"
                  placeholder="Referencia, folio o comentarios relevantes"
                  disabled={!selectedService}
                />
              </FormField>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">Resumen previo</p>
                  <span className="text-xs text-slate-500">Visible antes de registrar el pago</span>
                </div>

                <dl className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 shadow-sm">
                    <dt className="text-xs font-medium text-slate-500">Tarifa mensual</dt>
                    <dd className="text-sm font-semibold text-slate-800">
                      {selectedService ? peso(selectedServicePrice) : '—'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 shadow-sm">
                    <dt className="text-xs font-medium text-slate-500">Saldo pendiente previo</dt>
                    <dd className="text-sm font-semibold text-slate-800">
                      {outstandingAmount > 0 ? peso(outstandingAmount) : 'Sin pendiente'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 shadow-sm">
                    <dt className="text-xs font-medium text-slate-500">Saldo a favor previo</dt>
                    <dd className="text-sm font-semibold text-emerald-700">
                      {aheadAmount > 0 ? peso(aheadAmount) : 'Sin saldo a favor'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 shadow-sm">
                    <dt className="text-xs font-medium text-slate-500">Monto sugerido</dt>
                    <dd className="text-sm font-semibold text-blue-700">
                      {suggestedCharge > 0 ? peso(suggestedCharge) : 'Define el monto a cobrar'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 shadow-sm">
                    <dt className="text-xs font-medium text-slate-500">Monto recibido</dt>
                    <dd className="text-sm font-semibold text-slate-800">
                      {hasAmountValue ? peso(amountValue) : 'Pendiente de captura'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 shadow-sm">
                    <dt className="text-xs font-medium text-slate-500">Saldo resultante</dt>
                    <dd
                      className={`text-sm font-semibold ${
                        resultingPending > 0
                          ? 'text-amber-700'
                          : resultingAhead > 0
                            ? 'text-emerald-700'
                            : 'text-slate-800'
                      }`}
                    >
                      {resultingPending > 0
                        ? `${peso(resultingPending)} pendiente`
                        : resultingAhead > 0
                          ? `${peso(resultingAhead)} a favor`
                          : 'Al corriente'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 shadow-sm">
                    <dt className="text-xs font-medium text-slate-500">Estado</dt>
                    <dd className="text-sm font-semibold text-slate-800">
                      {coverageLabel}
                      {monthsCoveredLabel ? ` · ${monthsCoveredLabel}` : ''}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 shadow-sm">
                    <dt className="text-xs font-medium text-slate-500">Periodo cubierto</dt>
                    <dd className="text-sm font-semibold text-slate-800">
                      {coveragePeriodLabel ?? 'Sin periodo definido'}
                    </dd>
                  </div>
                </dl>
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
    </div>
  )
}
