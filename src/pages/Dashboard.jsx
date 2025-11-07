import React, { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react'
import { CalendarDays, DollarSign, Plus, Wifi } from 'lucide-react'
import { Link } from 'react-router-dom'
import StatCard from '../components/dashboard/StatCard.jsx'
import EarningsCard from '../components/dashboard/EarningsCard.jsx'
import Button from '../components/ui/Button.jsx'
import InfoTooltip from '../components/ui/InfoTooltip.jsx'
import {
  peso,
  formatPeriodLabel,
  diffPeriods,
  addMonthsToPeriod,
} from '../utils/formatters.js'
import { useDashboardMetrics } from '../hooks/useDashboardMetrics.js'
import { useClients } from '../hooks/useClients.js'
import { useDashboardData } from '../hooks/useDashboardData.js'
import { useToast } from '../hooks/useToast.js'
import { CLIENT_PRICE, useBackofficeStore } from '../store/useBackofficeStore.js'
import { useBackofficeRefresh } from '../contexts/BackofficeRefreshContext.jsx'
import DashboardSkeleton from './DashboardSkeleton.jsx'

const periodsFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })
const printDateFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'full',
  timeStyle: 'short',
})

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const formatPeriods = (value) => {
  const numericValue = Number(value) || 0
  return periodsFormatter.format(numericValue)
}

const isApproximatelyOne = (value) => Math.abs(Number(value) - 1) < 0.01

const toInputValue = (value, decimals = 2) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  return String(Number(value.toFixed(decimals)))
}

const createEmptyPaymentForm = () => ({
  open: false,
  clientId: '',
  mode: 'months',
  months: '1',
  amount: '',
  method: 'Efectivo',
  note: '',
})

const CLIENT_TYPE_LABELS = {
  residential: 'Cliente residencial',
  token: 'Punto con antena pública',
}

const getOutstandingPeriodKeys = (anchorPeriod, debtMonths) => {
  const normalizedAnchor = typeof anchorPeriod === 'string' ? anchorPeriod : null
  const numericDebt = Number(debtMonths ?? 0)

  if (!normalizedAnchor || !Number.isFinite(numericDebt) || numericDebt <= 0.0001) {
    return []
  }

  const completeMonths = Math.max(Math.floor(numericDebt), 0)
  const keys = []

  for (let index = 0; index < completeMonths; index += 1) {
    keys.push(addMonthsToPeriod(normalizedAnchor, -index))
  }

  return keys
}

const getFractionalDebt = (debtMonths) => {
  const numericDebt = Number(debtMonths ?? 0)

  if (!Number.isFinite(numericDebt)) {
    return 0
  }

  const fractional = Math.abs(numericDebt - Math.floor(numericDebt))
  return fractional > 0.0001 ? fractional : 0
}

export default function DashboardPage() {
  const initializeStatus = useBackofficeStore((state) => state.status.initialize)
  const { isRefreshing } = useBackofficeRefresh()
  const [statusFilter, setStatusFilter] = useState('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [paymentForm, setPaymentForm] = useState(createEmptyPaymentForm)
  const [paymentErrors, setPaymentErrors] = useState({})
  const [isRetryingSync, setIsRetryingSync] = useState(false)
  const [showEarningsBreakdown, setShowEarningsBreakdown] = useState(false)
  const [expandedClientId, setExpandedClientId] = useState(null)
  const paymentFormRef = useRef(null)
  const paymentMonthsInputRef = useRef(null)
  const paymentAmountInputRef = useRef(null)
  const lastMetricsFiltersRef = useRef({ statusFilter: 'pending', searchTerm: '' })

  const { showToast } = useToast()

  const {
    recordPayment,
    selectedPeriod,
    currentPeriod,
    historyStart,
    goToPreviousPeriod,
    goToNextPeriod,
    paymentsStatus,
  } = useBackofficeStore((state) => ({
    recordPayment: state.recordPayment,
    selectedPeriod: state.periods?.selected ?? state.periods?.current,
    currentPeriod: state.periods?.current ?? state.periods?.selected,
    historyStart: state.periods?.historyStart ?? state.periods?.current,
    goToPreviousPeriod: state.goToPreviousPeriod,
    goToNextPeriod: state.goToNextPeriod,
    paymentsStatus: state.status.payments,
  }))

  const {
    clients,
    status: clientsStatus,
    reload: reloadClients,
  } = useClients()

  const {
    expenses,
    status: dashboardStatus,
    reloadMetrics,
    reloadResellers,
    reloadExpenses,
  } = useDashboardData({
    periodKey: selectedPeriod,
    filters: { statusFilter, searchTerm },
  })

  const { metrics, filteredClients, baseCosts } = useDashboardMetrics({ statusFilter })

  const pendingClients = useMemo(
    () =>
      clients.filter((client) => Number(client.debtMonths ?? 0) > 0.0001),
    [clients],
  )

  const periodLabel = formatPeriodLabel(selectedPeriod ?? currentPeriod)
  const currentPeriodLabel = formatPeriodLabel(currentPeriod ?? selectedPeriod)
  const canGoPrevious = diffPeriods(historyStart ?? selectedPeriod, selectedPeriod ?? currentPeriod) > 0
  const canGoNext = diffPeriods(selectedPeriod ?? currentPeriod, currentPeriod ?? selectedPeriod) > 0
  const isCurrentPeriod = (selectedPeriod ?? currentPeriod) === (currentPeriod ?? selectedPeriod)
  const isSubmittingPayment = Boolean(paymentsStatus?.isMutating)
  const earningsSectionId = 'earnings-breakdown'
  const isEarningsLoading =
    Boolean(dashboardStatus.metrics?.isLoading) ||
    Boolean(dashboardStatus.resellers?.isLoading) ||
    Boolean(dashboardStatus.expenses?.isLoading)
  const isDataLoading =
    Boolean(clientsStatus?.isLoading) ||
    Boolean(dashboardStatus.metrics?.isLoading) ||
    Boolean(dashboardStatus.resellers?.isLoading) ||
    Boolean(dashboardStatus.expenses?.isLoading)
  const hasDataError =
    Boolean(clientsStatus?.error) ||
    Boolean(dashboardStatus.metrics?.error) ||
    Boolean(dashboardStatus.resellers?.error) ||
    Boolean(dashboardStatus.expenses?.error)
  const shouldShowSkeleton = Boolean(initializeStatus?.isLoading) || isRefreshing

  useEffect(() => {
    if (!isCurrentPeriod) {
      setPaymentForm(createEmptyPaymentForm())
    }
  }, [isCurrentPeriod, setPaymentForm])

  useEffect(() => {
    if (!paymentForm.open) {
      return
    }

    const focusAndScroll = () => {
      const targetInput =
        paymentForm.mode === 'amount'
          ? paymentAmountInputRef.current
          : paymentMonthsInputRef.current

      if (paymentFormRef.current) {
        paymentFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }

      targetInput?.focus({ preventScroll: true })
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(focusAndScroll)
    } else {
      focusAndScroll()
    }
  }, [paymentForm.open, paymentForm.mode])

  useEffect(() => {
    const previousFilters = lastMetricsFiltersRef.current
    const filtersChanged =
      previousFilters?.statusFilter !== statusFilter || previousFilters?.searchTerm !== searchTerm

    if (!filtersChanged) {
      lastMetricsFiltersRef.current = { statusFilter, searchTerm }
      return
    }

    if (dashboardStatus.metrics?.isLoading) {
      return
    }

    reloadMetrics().catch(() => {})

    lastMetricsFiltersRef.current = { statusFilter, searchTerm }
  }, [
    statusFilter,
    searchTerm,
    reloadMetrics,
    dashboardStatus.metrics?.isLoading,
  ])

  useEffect(() => {
    if (statusFilter !== 'all' && showEarningsBreakdown) {
      setShowEarningsBreakdown(false)
    }
  }, [statusFilter, showEarningsBreakdown])

  const filterDescription = useMemo(() => {
    if (statusFilter === 'paid') {
      return `Mostrando clientes al día en ${periodLabel}`
    }
    if (statusFilter === 'pending') {
      return `Mostrando clientes con pagos pendientes en ${periodLabel}`
    }
    return `Mostrando todos los clientes activos en ${periodLabel}`
  }, [statusFilter, periodLabel])

  const handlePrintPendingClients = useCallback(() => {
    const summaries = pendingClients
      .map((client) => {
        const debtMonths = Number(client.debtMonths ?? 0)

        if (!Number.isFinite(debtMonths) || debtMonths <= 0.0001) {
          return null
        }

        const monthlyFee = client.monthlyFee ?? CLIENT_PRICE
        const totalDue = debtMonths * monthlyFee

        return {
          name: client.name ?? 'Sin nombre',
          location: client.location ?? 'Sin localidad',
          debtMonths,
          totalDue,
        }
      })
      .filter(Boolean)

    if (summaries.length === 0) {
      showToast({
        type: 'info',
        title: 'No hay clientes con pagos pendientes',
        description: 'Todos los clientes están al día.',
      })
      return
    }

    const totalDueAmount = summaries.reduce((sum, summary) => sum + summary.totalDue, 0)
    const reportDate = printDateFormatter.format(new Date())
    const tableRows = summaries
      .map((summary, index) => {
        const debtLabel = `${formatPeriods(summary.debtMonths)} ${
          isApproximatelyOne(summary.debtMonths) ? 'periodo' : 'periodos'
        }`
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(summary.name)}</td>
            <td>${escapeHtml(summary.location)}</td>
            <td>${escapeHtml(debtLabel)}</td>
            <td>${escapeHtml(peso(summary.totalDue))}</td>
          </tr>
        `
      })
      .join('')

    const printWindow = window.open('', '_blank', 'width=900,height=700')

    if (!printWindow) {
      showToast({
        type: 'error',
        title: 'No se pudo abrir la ventana de impresión',
        description: 'Verifica que el navegador permita ventanas emergentes.',
      })
      return
    }

    printWindow.document.write(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Clientes con pagos pendientes</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body {
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        margin: 32px;
        color: #0f172a;
        background-color: #ffffff;
      }
      h1 {
        font-size: 1.75rem;
        margin: 0 0 0.5rem 0;
      }
      p.meta {
        margin: 0 0 1.5rem 0;
        color: #475569;
        font-size: 0.95rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 0.5rem;
      }
      thead {
        background-color: #e2e8f0;
        color: #0f172a;
      }
      th, td {
        border: 1px solid #cbd5f5;
        padding: 6px 10px;
        text-align: left;
        font-size: 0.9rem;
        line-height: 1.3;
      }
      tbody tr:nth-child(even) {
        background-color: #f8fafc;
      }
      tfoot td {
        font-weight: 600;
        background-color: #f1f5f9;
      }
      @media print {
        body {
          margin: 0.5in;
        }
      }
    </style>
  </head>
  <body>
    <h1>Clientes con pagos pendientes</h1>
    <p class="meta">Reporte generado el ${escapeHtml(reportDate)}. Se listan ${summaries.length} cliente(s) con adeudos.</p>
    <table>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Nombre</th>
          <th scope="col">Localidad</th>
          <th scope="col">Periodos adeudados</th>
          <th scope="col">Total adeudado</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4">Total adeudado</td>
          <td>${escapeHtml(peso(totalDueAmount))}</td>
        </tr>
      </tfoot>
    </table>
  </body>
</html>`)

    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }, [pendingClients, showToast])

  const handleClosePaymentForm = useCallback(() => {
    setPaymentForm(createEmptyPaymentForm())
  }, [])

  const activeClient = useMemo(
    () => clients.find((client) => client.id === paymentForm.clientId) ?? null,
    [clients, paymentForm.clientId],
  )

  useEffect(() => {
    if (!expandedClientId) {
      return
    }

    const stillVisible = filteredClients.some((client) => client.id === expandedClientId)
    if (!stillVisible) {
      setExpandedClientId(null)
    }
  }, [expandedClientId, filteredClients])

  if (shouldShowSkeleton) {
    return <DashboardSkeleton />
  }

  const handleRetrySync = async () => {
    setIsRetryingSync(true)
    try {
      await Promise.all([
        reloadClients(),
        reloadMetrics(),
        reloadResellers(),
        reloadExpenses(),
      ])
      showToast({
        type: 'success',
        title: 'Datos sincronizados',
        description: 'La información se recargó correctamente.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudieron recargar los datos',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    } finally {
      setIsRetryingSync(false)
    }
  }

  const handleToggleClientDetails = (clientId) => {
    setExpandedClientId((current) => (current === clientId ? null : clientId))
  }

  const handleOpenPaymentForm = (client) => {
    if (!isCurrentPeriod) return

    const debtMonths = Number(client.debtMonths ?? 0)
    const monthlyFee = client.monthlyFee ?? CLIENT_PRICE
    const baseMonths = debtMonths > 0 ? debtMonths : 1

    setPaymentForm({
      open: true,
      clientId: client.id,
      mode: 'months',
      months: toInputValue(baseMonths, 4) || '1',
      amount: toInputValue(baseMonths * monthlyFee, 2),
      method: 'Efectivo',
      note: '',
    })
    setPaymentErrors({})
  }

  const activeMonthlyFee = activeClient?.monthlyFee ?? CLIENT_PRICE
  const outstandingAmount = (activeClient?.debtMonths ?? 0) * activeMonthlyFee
  const plannedAmount =
    paymentForm.mode === 'amount'
      ? Number(paymentForm.amount) || 0
      : (Number(paymentForm.months) || 0) * activeMonthlyFee
  const plannedMonths =
    paymentForm.mode === 'amount'
      ? activeMonthlyFee > 0
        ? (Number(paymentForm.amount) || 0) / activeMonthlyFee
        : 0
      : Number(paymentForm.months) || 0
  const remainingBalance = Math.max(0, outstandingAmount - plannedAmount)
  const additionalAhead = Math.max(0, plannedMonths - (activeClient?.debtMonths ?? 0))
  const detailAnchorPeriod = selectedPeriod ?? currentPeriod ?? null

  const handleSubmitPayment = async (event) => {
    event.preventDefault()
    const errors = {}
    if (!paymentForm.clientId) {
      errors.clientId = 'Selecciona un cliente para registrar el pago.'
    }
    if (!activeClient) {
      errors.client = 'No se encontró información del cliente seleccionado.'
    }

    const monthlyFeeRaw = Number(activeClient?.monthlyFee)
    const monthlyFee = Number.isFinite(monthlyFeeRaw) ? monthlyFeeRaw : CLIENT_PRICE
    const hasPositiveMonthlyFee = monthlyFee > 0

    const monthsValue = Number(paymentForm.months)
    const amountValue = Number(paymentForm.amount)
    const isAmountMode = paymentForm.mode === 'amount'

    if (isAmountMode) {
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        errors.amount = 'Ingresa un monto mayor a cero.'
      }
      if (!hasPositiveMonthlyFee) {
        errors.mode = 'Registra el pago por periodos porque el cliente no tiene una tarifa mensual.'
      }
    } else if (!Number.isFinite(monthsValue) || monthsValue <= 0) {
      errors.months = 'Ingresa un número de periodos mayor a cero.'
    }

    if (Object.keys(errors).length > 0) {
      setPaymentErrors(errors)
      const firstError = Object.values(errors)[0]
      showToast({
        type: 'error',
        title: 'Revisa la información del pago',
        description: firstError,
      })
      return
    }

    setPaymentErrors({})

    const monthsToRegister = isAmountMode
      ? amountValue / monthlyFee
      : monthsValue
    const amountToRegister = isAmountMode ? amountValue : monthsValue * monthlyFee

    try {
      await recordPayment({
        clientId: paymentForm.clientId,
        months: monthsToRegister,
        amount: amountToRegister,
        method: paymentForm.method,
        note: paymentForm.note,
        periodKey: selectedPeriod,
      })

      showToast({
        type: 'success',
        title: 'Pago registrado',
        description: `Se registró el pago de ${peso(amountToRegister)} (${formatPeriods(monthsToRegister)} ${
          isApproximatelyOne(monthsToRegister) ? 'periodo' : 'periodos'
        }) para ${activeClient?.name ?? 'el cliente'}.`,
      })
      setPaymentForm(createEmptyPaymentForm())
      if (searchTerm.trim().length > 0) {
        setSearchTerm('')
      }
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo registrar el pago',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    }
  }

  const QuickPaymentForm = ({ className = '', refCallback }) => {
    if (!activeClient) {
      return null
    }

    return (
      <form
        ref={refCallback}
        className={`w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:p-5 ${className}`}
        onSubmit={handleSubmitPayment}
      >
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">Registrar pago rápido</h3>
          <p className="text-xs text-slate-500">
            {activeClient.name} adeuda {formatPeriods(activeClient.debtMonths)} periodo(s). Pago mensual:{' '}
            {peso(activeMonthlyFee)}. Adeudo total: {peso(outstandingAmount)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
          <span className="text-slate-500">Registrar por</span>
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name="payment-mode"
              value="months"
              checked={paymentForm.mode === 'months'}
              onChange={() => handleModeChange('months')}
              className="h-3.5 w-3.5"
            />
            Periodos
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name="payment-mode"
              value="amount"
              checked={paymentForm.mode === 'amount'}
              onChange={() => handleModeChange('amount')}
              className="h-3.5 w-3.5"
              disabled={Number(activeMonthlyFee) <= 0}
              title={
                Number(activeMonthlyFee) <= 0
                  ? 'Configura una tarifa mensual para habilitar el pago por monto.'
                  : undefined
              }
            />
            Monto
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Periodos pagados
            <input
              ref={paymentMonthsInputRef}
              min={0.01}
              step="0.01"
              value={paymentForm.months}
              onChange={(event) => handleMonthsInputChange(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              type="number"
              required
              disabled={paymentForm.mode === 'amount'}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Monto a pagar
            <input
              ref={paymentAmountInputRef}
              min={0.01}
              step="0.01"
              value={paymentForm.amount}
              onChange={(event) => handleAmountInputChange(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              type="number"
              required
              disabled={paymentForm.mode === 'months'}
            />
          </label>
        </div>
        <div className="space-y-1 rounded-lg bg-slate-50/80 p-3 text-xs text-slate-500">
          <p>
            Pago a registrar: {peso(plannedAmount)} ({formatPeriods(plannedMonths)}{' '}
            {isApproximatelyOne(plannedMonths) ? 'periodo' : 'periodos'}).
          </p>
          {outstandingAmount > 0 && plannedAmount < outstandingAmount && (
            <p>Restante tras el pago: {peso(remainingBalance)}.</p>
          )}
          {plannedAmount > outstandingAmount && (
            <p className="text-amber-600">
              Esto agregará {formatPeriods(additionalAhead)}{' '}
              {isApproximatelyOne(additionalAhead) ? 'periodo' : 'periodos'} adelantados.
            </p>
          )}
        </div>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          Nota (opcional)
          <textarea
            value={paymentForm.note}
            onChange={(event) => setPaymentForm((prev) => ({ ...prev, note: event.target.value }))}
            className="min-h-[60px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="w-full border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 sm:w-auto"
            onClick={handleClosePaymentForm}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSubmittingPayment}
            className="w-full sm:w-auto"
          >
            {isSubmittingPayment ? 'Registrando…' : 'Confirmar pago'}
          </Button>
        </div>
      </form>
    )
  }

  const handleMonthsInputChange = (value) => {
    setPaymentForm((prev) => {
      if (value === '') {
        return { ...prev, months: '', amount: '' }
      }

      const numericValue = Number(value)
      if (!Number.isFinite(numericValue)) {
        return { ...prev, months: value }
      }

      const normalizedMonths = Math.max(0, numericValue)
      const derivedAmount = normalizedMonths * activeMonthlyFee

      return {
        ...prev,
        months: value,
        amount: toInputValue(derivedAmount, 2),
      }
    })
    setPaymentErrors((prev) => {
      if (!prev.months && !prev.amount) return prev
      const next = { ...prev }
      delete next.months
      delete next.amount
      return next
    })
  }

  const handleAmountInputChange = (value) => {
    setPaymentForm((prev) => {
      if (value === '') {
        return { ...prev, amount: '', months: '' }
      }

      const numericValue = Number(value)
      if (!Number.isFinite(numericValue)) {
        return { ...prev, amount: value }
      }

      const normalizedAmount = Math.max(0, numericValue)
      const derivedMonths =
        activeMonthlyFee > 0 ? normalizedAmount / activeMonthlyFee : 0

      return {
        ...prev,
        amount: value,
        months: toInputValue(derivedMonths, 4),
      }
    })
    setPaymentErrors((prev) => {
      if (!prev.amount && !prev.months) return prev
      const next = { ...prev }
      delete next.amount
      delete next.months
      return next
    })
  }

  const handleModeChange = (mode) => {
    setPaymentForm((prev) => {
      if (prev.mode === mode) return prev

      if (mode === 'amount') {
        const numericMonths = Number(prev.months)
        if (!Number.isFinite(numericMonths) || numericMonths <= 0) {
          return { ...prev, mode }
        }
        const derivedAmount = Math.max(0, numericMonths) * activeMonthlyFee
        return {
          ...prev,
          mode,
          amount: toInputValue(derivedAmount, 2),
        }
      }

      if (mode === 'months') {
        const numericAmount = Number(prev.amount)
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
          return { ...prev, mode }
        }
        const derivedMonths =
          activeMonthlyFee > 0 ? Math.max(0, numericAmount) / activeMonthlyFee : 0
        return {
          ...prev,
          mode,
          months: toInputValue(derivedMonths, 4),
        }
      }

      return { ...prev, mode }
    })
    setPaymentErrors((prev) => {
      if (!prev.mode) return prev
      const next = { ...prev }
      delete next.mode
      return next
    })
  }

  return (
    <div className="space-y-8">
      {isDataLoading && (
        <div
          role="status"
          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700"
        >
          Sincronizando información del periodo {periodLabel}…
        </div>
      )}
      {hasDataError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          <span>Ocurrió un problema al sincronizar los datos. Intenta recargar.</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="border border-red-200 bg-white text-red-700 hover:border-red-300"
            onClick={handleRetrySync}
            disabled={isRetryingSync}
          >
            {isRetryingSync ? 'Reintentando…' : 'Reintentar'}
          </Button>
        </div>
      )}
      <section aria-labelledby="resumen" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="resumen" className="text-lg font-semibold text-slate-900">
                Resumen del periodo
              </h2>
              <span className="rounded-full bg-slate-200/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                {periodLabel}
              </span>
            </div>
            <p className="text-sm text-slate-500">
              Controla las suscripciones activas, ingresos estimados y pendientes por cobrar.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span className="font-medium text-slate-600">Cambiar periodo:</span>
              <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={goToPreviousPeriod}
                  disabled={!canGoPrevious}
                  className="text-slate-600 disabled:opacity-50"
                >
                  Anterior
                </Button>
                <span className="min-w-[140px] text-center text-sm font-semibold text-slate-700">
                  {periodLabel}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={goToNextPeriod}
                  disabled={!canGoNext}
                  className="text-slate-600 disabled:opacity-50"
                >
                  Siguiente
                </Button>
              </div>
              {!isCurrentPeriod && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Vista histórica
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                to="/clients#nuevo"
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                Agregar nuevo cliente
              </Link>
              <Link
                to="/clients"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                Administrar clientes →
              </Link>
            </div>
            <span className="text-xs text-slate-500">Periodo actual: {currentPeriodLabel}</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Pagos del servicio"
            value={peso(metrics.paymentsForPeriod)}
            icon={CalendarDays}
            trend={
              metrics.paymentsToday > 0
                ? `Hoy: ${peso(metrics.paymentsToday)}`
                : 'Hoy: sin pagos registrados'
            }
            trendClassName="text-sm font-medium text-slate-500"
            valueClassName="text-3xl font-semibold text-slate-900"
          />
          <StatCard
            title="Pendientes de pago"
            value={metrics.pendingClients}
            icon={DollarSign}
            trend={
              metrics.pendingClients > 0
                ? `${
                    metrics.pendingClients === 1
                      ? '1 cliente con pago pendiente'
                      : `${metrics.pendingClients} clientes con pago pendiente`
                  }`
                : 'Sin pagos pendientes'
            }
            onClick={() => setStatusFilter((current) => (current === 'pending' ? 'all' : 'pending'))}
            aria-pressed={statusFilter === 'pending'}
            className={`${
              statusFilter === 'pending'
                ? 'ring-2 ring-blue-200'
                : metrics.pendingClients > 0
                  ? 'ring-2 ring-amber-200'
                  : ''
            }`}
          />
          <StatCard
            title="Ingresos estimados"
            value={peso(metrics.clientIncome + metrics.resellerIncome)}
            icon={Wifi}
            trend={`Gastos: ${peso(metrics.internetCosts + metrics.totalExpenses)}`}
            onClick={() => {
              setStatusFilter('all')
              setShowEarningsBreakdown((prev) => !prev)
            }}
            aria-pressed={showEarningsBreakdown}
            aria-controls={earningsSectionId}
            className={`${
              showEarningsBreakdown
                ? 'ring-2 ring-emerald-200'
                : statusFilter === 'all'
                  ? 'ring-2 ring-slate-200'
                  : ''
            }`}
          />
        </div>
        {showEarningsBreakdown && (
          <div
            id={earningsSectionId}
            className="relative mt-2"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowEarningsBreakdown(false)}
              className="absolute right-4 top-4 z-10 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Cerrar
            </Button>
            {isEarningsLoading ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Calculando ingresos y egresos…
              </div>
            ) : (
              <EarningsCard
                earningsDemo={metrics.netEarnings}
                clientIncomeDemo={metrics.clientIncome}
                resellerIncomeDemo={metrics.resellerIncome}
                baseCosts={baseCosts}
                expenses={expenses}
              />
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="clientes" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="clientes" className="text-lg font-semibold text-slate-900">
              Clientes por estado
            </h2>
            <p className="text-sm text-slate-500">Filtra y registra pagos sin perder el contexto.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{filterDescription}</span>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
              <label className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 focus-within:ring-2 focus-within:ring-blue-500/40 sm:max-w-sm">
                <span className="sr-only">Buscar cliente o localidad</span>
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar cliente o localidad"
                  aria-label="Buscar cliente o localidad"
                  className="w-full border-none bg-transparent text-sm text-slate-700 outline-none"
                  type="search"
                />
              </label>
              <Button
                type="button"
                size="sm"
                onClick={handlePrintPendingClients}
                disabled={pendingClients.length === 0}
                className="w-full sm:w-auto sm:self-start disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingClients.length > 0
                  ? `Imprimir pendientes (${pendingClients.length})`
                  : 'Imprimir pendientes'}
              </Button>
            </div>
            <p className="text-sm text-slate-500" role="status">
              {filteredClients.length} cliente(s) coinciden con el filtro en {periodLabel}.
            </p>
          </div>

          {!isCurrentPeriod && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Estás consultando el periodo de {periodLabel}. Para registrar pagos, vuelve al periodo actual
              ({currentPeriodLabel}).
            </div>
          )}

          <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm" role="grid">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Nombre
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Localidad
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Pago mensual
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Estado
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.map((client) => {
                  const isExpanded = expandedClientId === client.id
                  const isPaymentActive =
                    paymentForm.open && paymentForm.clientId === client.id && Boolean(activeClient)
                  return (
                    <React.Fragment key={client.id}>
                      <tr>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => handleToggleClientDetails(client.id)}
                            aria-expanded={isExpanded}
                            aria-controls={`client-details-${client.id}`}
                            className="flex w-full flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                          >
                            <span className="font-medium text-slate-900">{client.name}</span>
                            <span className="text-xs text-blue-600">
                              {isExpanded ? 'Ocultar detalle' : 'Ver detalle rápido'}
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          <button
                            type="button"
                            onClick={() => setSearchTerm(client.location ?? '')}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                          >
                            {client.location || 'Sin localidad'}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{peso(client.monthlyFee ?? CLIENT_PRICE)}</td>
                        <td className="px-3 py-2">
                          {(() => {
                            const debtMonths = Number(client.debtMonths ?? 0)
                            const hasDebt = debtMonths > 0.0001
                            const monthlyFee = client.monthlyFee ?? CLIENT_PRICE
                            const totalDue = debtMonths * monthlyFee

                            return (
                              <div className="flex flex-col gap-1">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                    hasDebt ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                                  }`}
                                >
                                  {hasDebt ? '⚠️' : '✅'}
                                  {hasDebt
                                    ? `Debe ${formatPeriods(debtMonths)} ${
                                        isApproximatelyOne(debtMonths) ? 'periodo' : 'periodos'
                                      }`
                                    : 'Al día'}
                                </span>
                                {hasDebt && (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                                    <span aria-hidden="true">🛑</span>
                                    <span>
                                      Total adeudado: <span className="font-bold">{peso(totalDue)}</span>
                                    </span>
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              disabled={!isCurrentPeriod || isSubmittingPayment}
                              className="w-full whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                              onClick={() => handleOpenPaymentForm(client)}
                            >
                              Registrar pago
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isPaymentActive && (
                        <tr>
                          <td colSpan={5} className="bg-slate-50 px-3 py-3">
                            <QuickPaymentForm refCallback={paymentFormRef} />
                          </td>
                        </tr>
                      )}
                      {isExpanded && (
                        <tr id={`client-details-${client.id}`}>
                          <td colSpan={5} className="bg-slate-50 px-3 py-3">
                            {(() => {
                              const debtMonths = Number(client.debtMonths ?? 0)
                              const monthlyFee = client.monthlyFee ?? CLIENT_PRICE
                              const totalDue = debtMonths * monthlyFee
                              const outstandingPeriodKeys = getOutstandingPeriodKeys(
                                detailAnchorPeriod,
                                debtMonths,
                              )
                              const outstandingPeriodLabels = outstandingPeriodKeys.map((periodKey) =>
                                formatPeriodLabel(periodKey),
                              )
                              const fractionalDebt = getFractionalDebt(debtMonths)
                              const paidMonthsAhead = Number(client.paidMonthsAhead ?? 0)
                              const clientTypeLabel = CLIENT_TYPE_LABELS[client.type] ?? 'Sin especificar'

                              return (
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h4 className="text-sm font-semibold text-slate-800">
                                      Información detallada del cliente
                                    </h4>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedClientId(null)}
                                      className="text-xs font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                                    >
                                      Cerrar
                                    </button>
                                  </div>
                                  <div className="grid gap-4 lg:grid-cols-3">
                                    <div className="space-y-2">
                                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Adeudos en {periodLabel}
                                      </p>
                                      {debtMonths > 0.0001 ? (
                                        <>
                                          <p className="text-sm text-slate-600">
                                            Debe {formatPeriods(debtMonths)}{' '}
                                            {isApproximatelyOne(debtMonths) ? 'periodo' : 'periodos'} ({peso(totalDue)}).
                                          </p>
                                          {outstandingPeriodLabels.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                              {outstandingPeriodLabels.map((label) => (
                                                <span
                                                  key={label}
                                                  className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700"
                                                >
                                                  {label}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                          {fractionalDebt > 0 && (
                                            <p className="text-xs text-amber-700">
                                              Incluye un periodo parcial de {formatPeriods(fractionalDebt)}.
                                            </p>
                                          )}
                                        </>
                                      ) : (
                                        <p className="text-sm text-emerald-600">Sin adeudos en este periodo.</p>
                                      )}
                                    </div>
                                    <div className="space-y-2">
                                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Estado del servicio
                                      </p>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span
                                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                                            client.service === 'Activo'
                                              ? 'bg-emerald-50 text-emerald-700'
                                              : 'bg-red-50 text-red-700'
                                          }`}
                                        >
                                          Estado: {client.service}
                                        </span>
                                        <span className="inline-flex items-center rounded-full bg-slate-200/70 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                          Tipo: {clientTypeLabel}
                                        </span>
                                        {paidMonthsAhead > 0.0001 && (
                                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                            Adelantó {formatPeriods(paidMonthsAhead)}{' '}
                                            {isApproximatelyOne(paidMonthsAhead) ? 'periodo' : 'periodos'}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Accesos rápidos
                                      </p>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Link
                                          to={`/clients#client-${client.id}`}
                                          className="inline-flex items-center gap-1 rounded-md border border-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                                        >
                                          Abrir en clientes →
                                        </Link>
                                        <Button
                                          type="button"
                                          size="sm"
                                          disabled={!isCurrentPeriod || isSubmittingPayment}
                                          className="disabled:cursor-not-allowed disabled:opacity-50"
                                          onClick={() => handleOpenPaymentForm(client)}
                                        >
                                          Registrar pago
                                        </Button>
                                      </div>
                                      <p className="text-xs text-slate-500">
                                        Periodo consultado: {periodLabel}.{' '}
                                        {isCurrentPeriod ? '' : `Vista histórica respecto a ${currentPeriodLabel}.`}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
                {filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                      No hay clientes que coincidan con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
