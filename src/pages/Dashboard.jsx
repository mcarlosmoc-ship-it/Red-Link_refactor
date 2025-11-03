import React, { useEffect, useMemo, useState } from 'react'
import { DollarSign, Users, Wifi } from 'lucide-react'
import { Link } from 'react-router-dom'
import StatCard from '../components/dashboard/StatCard.jsx'
import Button from '../components/ui/Button.jsx'
import { peso, formatPeriodLabel, diffPeriods } from '../utils/formatters.js'
import { useDashboardMetrics } from '../hooks/useDashboardMetrics.js'
import { useClients } from '../hooks/useClients.js'
import { useDashboardData } from '../hooks/useDashboardData.js'
import { useToast } from '../hooks/useToast.js'
import { CLIENT_PRICE, useBackofficeStore } from '../store/useBackofficeStore.js'

const periodsFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })

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

export default function DashboardPage() {
  const [statusFilter, setStatusFilter] = useState('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [paymentForm, setPaymentForm] = useState(createEmptyPaymentForm)
  const [isRetryingSync, setIsRetryingSync] = useState(false)

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
    status: dashboardStatus,
    reloadMetrics,
    reloadResellers,
    reloadExpenses,
  } = useDashboardData({
    periodKey: selectedPeriod,
    filters: { statusFilter, searchTerm },
  })

  const { metrics, filteredClients } = useDashboardMetrics()

  const periodLabel = formatPeriodLabel(selectedPeriod ?? currentPeriod)
  const currentPeriodLabel = formatPeriodLabel(currentPeriod ?? selectedPeriod)
  const canGoPrevious = diffPeriods(historyStart ?? selectedPeriod, selectedPeriod ?? currentPeriod) > 0
  const canGoNext = diffPeriods(selectedPeriod ?? currentPeriod, currentPeriod ?? selectedPeriod) > 0
  const isCurrentPeriod = (selectedPeriod ?? currentPeriod) === (currentPeriod ?? selectedPeriod)
  const isSubmittingPayment = Boolean(paymentsStatus?.isMutating)
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

  useEffect(() => {
    if (!isCurrentPeriod) {
      setPaymentForm(createEmptyPaymentForm())
    }
  }, [isCurrentPeriod, setPaymentForm])

  const filterDescription = useMemo(() => {
    if (statusFilter === 'paid') {
      return `Mostrando clientes al día en ${periodLabel}`
    }
    if (statusFilter === 'pending') {
      return `Mostrando clientes con pagos pendientes en ${periodLabel}`
    }
    return `Mostrando todos los clientes activos en ${periodLabel}`
  }, [statusFilter, periodLabel])

  const activeClient = useMemo(
    () => clients.find((client) => client.id === paymentForm.clientId) ?? null,
    [clients, paymentForm.clientId],
  )

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

  const handleSubmitPayment = async (event) => {
    event.preventDefault()
    if (!paymentForm.clientId) {
      showToast({
        type: 'error',
        title: 'Selecciona un cliente',
        description: 'Elige un cliente para registrar el pago.',
      })
      return
    }
    if (!activeClient) {
      showToast({
        type: 'error',
        title: 'Cliente no encontrado',
        description: 'No se encontró información del cliente seleccionado.',
      })
      return
    }

    const monthlyFee = activeClient?.monthlyFee ?? CLIENT_PRICE
    const normalizedMonthlyFee = monthlyFee > 0 ? monthlyFee : CLIENT_PRICE

    const monthsValue = Number(paymentForm.months)
    const amountValue = Number(paymentForm.amount)
    const isAmountMode = paymentForm.mode === 'amount'

    if (isAmountMode) {
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        showToast({
          type: 'error',
          title: 'Monto inválido',
          description: 'Ingresa un monto mayor a cero.',
        })
        return
      }
    } else if (!Number.isFinite(monthsValue) || monthsValue <= 0) {
      showToast({
        type: 'error',
        title: 'Periodo inválido',
        description: 'Ingresa un número de periodos mayor a cero.',
      })
      return
    }

    const monthsToRegister = isAmountMode
      ? normalizedMonthlyFee > 0
        ? amountValue / normalizedMonthlyFee
        : 0
      : monthsValue
    const amountToRegister = isAmountMode ? amountValue : monthsValue * normalizedMonthlyFee

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
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo registrar el pago',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    }
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
            <Link
              to="/clients"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              Administrar clientes →
            </Link>
            <span className="text-xs text-slate-500">Periodo actual: {currentPeriodLabel}</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Clientes activos"
            value={`${metrics.totalClients} activos`}
            icon={Users}
            trend={`${metrics.paidClients} al día`}
            valueClassName="text-sm font-medium text-slate-500"
            trendClassName="text-3xl font-semibold text-slate-900"
            onClick={() => setStatusFilter((current) => (current === 'paid' ? 'all' : 'paid'))}
            aria-pressed={statusFilter === 'paid'}
            className={`${statusFilter === 'paid' ? 'ring-2 ring-emerald-200' : ''}`}
          />
          <StatCard
            title="Pendientes de pago"
            value={metrics.pendingClients}
            icon={DollarSign}
            trend={metrics.pendingClients > 0 ? `-${metrics.pendingClients} por cobrar` : 'Todo al día'}
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
            onClick={() => setStatusFilter('all')}
            aria-pressed={statusFilter === 'all'}
            className={`${statusFilter === 'all' ? 'ring-2 ring-slate-200' : ''}`}
          />
        </div>
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
                {filteredClients.map((client) => (
                  <tr key={client.id}>
                    <td className="px-3 py-2 font-medium text-slate-900">{client.name}</td>
                    <td className="px-3 py-2 text-slate-600">{client.location}</td>
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
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                hasDebt ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {hasDebt
                                ? `Debe ${formatPeriods(debtMonths)} ${
                                    isApproximatelyOne(debtMonths) ? 'periodo' : 'periodos'
                                  }`
                                : 'Al día'}
                            </span>
                            {hasDebt && (
                              <span className="text-xs font-medium text-red-600">
                                Total: {peso(totalDue)}
                              </span>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!isCurrentPeriod || isSubmittingPayment}
                        className="disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
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
                        }}
                      >
                        Registrar pago
                      </Button>
                    </td>
                  </tr>
                ))}
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

          {paymentForm.open && activeClient && (
            <form className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4" onSubmit={handleSubmitPayment}>
              <h3 className="text-sm font-semibold text-slate-800">Registrar pago rápido</h3>
              <p className="text-xs text-slate-500">
                {activeClient.name} tiene {formatPeriods(activeClient.debtMonths)} periodo(s) pendientes y{' '}
                {formatPeriods(activeClient.paidMonthsAhead)} adelantados.
              </p>
              <p className="text-xs text-slate-500">
                Pago mensual acordado: {peso(activeMonthlyFee)}. Adeudo total: {peso(outstandingAmount)}.
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
                <span className="text-slate-500">Registrar por:</span>
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
                  />
                  Monto
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Periodos pagados
                  <input
                    min={0.01}
                    step="0.01"
                    value={paymentForm.months}
                    onChange={(event) => handleMonthsInputChange(event.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    type="number"
                    required
                    disabled={paymentForm.mode === 'amount'}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Monto a pagar
                  <input
                    min={0.01}
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(event) => handleAmountInputChange(event.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    type="number"
                    required
                    disabled={paymentForm.mode === 'months'}
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
                    required
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Tarjeta">Tarjeta</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-1 text-xs text-slate-500">
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
                    {isApproximatelyOne(additionalAhead) ? 'periodo' : 'periodos'}{' '}
                    adelantados.
                  </p>
                )}
              </div>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Nota (opcional)
                <textarea
                  value={paymentForm.note}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                  className="min-h-[60px] rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
                  onClick={() => setPaymentForm(createEmptyPaymentForm())}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmittingPayment ? 'Registrando…' : 'Confirmar pago'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
