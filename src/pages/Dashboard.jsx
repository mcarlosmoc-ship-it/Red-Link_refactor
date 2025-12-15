import React, { useMemo, useState } from 'react'
import { CalendarDays, DollarSign, Plus, Wifi } from 'lucide-react'
import { Link } from 'react-router-dom'
import StatCard from '../components/dashboard/StatCard.jsx'
import EarningsCard from '../components/dashboard/EarningsCard.jsx'
import Button from '../components/ui/Button.jsx'
import { formatPeriodLabel, diffPeriods, peso } from '../utils/formatters.js'
import { useDashboardMetrics } from '../hooks/useDashboardMetrics.js'
import { useDashboardData } from '../hooks/useDashboardData.js'
import { useToast } from '../hooks/useToast.js'
import { useBackofficeStore } from '../store/useBackofficeStore.js'
import { useBackofficeRefresh } from '../contexts/BackofficeRefreshContext.jsx'
import DashboardSkeleton from './DashboardSkeleton.jsx'

export default function DashboardPage() {
  const initializeStatus = useBackofficeStore((state) => state.status.initialize)
  const { isRefreshing } = useBackofficeRefresh()
  const [showEarningsBreakdown, setShowEarningsBreakdown] = useState(false)

  const {
    selectedPeriod,
    currentPeriod,
    historyStart,
    goToPreviousPeriod,
    goToNextPeriod,
  } = useBackofficeStore((state) => ({
    selectedPeriod: state.periods?.selected ?? state.periods?.current,
    currentPeriod: state.periods?.current ?? state.periods?.selected,
    historyStart: state.periods?.historyStart ?? state.periods?.current,
    goToPreviousPeriod: state.goToPreviousPeriod,
    goToNextPeriod: state.goToNextPeriod,
  }))

  const { status: dashboardStatus, reloadMetrics, reloadResellers, reloadExpenses } = useDashboardData({
    periodKey: selectedPeriod,
  })

  const { metrics, baseCosts } = useDashboardMetrics()
  const { showToast } = useToast()

  const periodLabel = formatPeriodLabel(selectedPeriod ?? currentPeriod)
  const currentPeriodLabel = formatPeriodLabel(currentPeriod ?? selectedPeriod)
  const canGoPrevious = diffPeriods(historyStart ?? selectedPeriod, selectedPeriod ?? currentPeriod) > 0
  const canGoNext = diffPeriods(selectedPeriod ?? currentPeriod, currentPeriod ?? selectedPeriod) > 0
  const isCurrentPeriod = (selectedPeriod ?? currentPeriod) === (currentPeriod ?? selectedPeriod)
  const earningsSectionId = 'earnings-breakdown'

  const isEarningsLoading =
    Boolean(dashboardStatus.metrics?.isLoading) ||
    Boolean(dashboardStatus.resellers?.isLoading) ||
    Boolean(dashboardStatus.expenses?.isLoading)

  const isDataLoading = isEarningsLoading
  const hasDataError =
    Boolean(dashboardStatus.metrics?.error) ||
    Boolean(dashboardStatus.resellers?.error) ||
    Boolean(dashboardStatus.expenses?.error)

  const dataErrorMessage =
    dashboardStatus.metrics?.error?.message ??
    dashboardStatus.resellers?.error?.message ??
    dashboardStatus.expenses?.error?.message ??
    'No pudimos cargar la información.'

  const shouldShowSkeleton = Boolean(initializeStatus?.isLoading) || isRefreshing

  const quickLinks = useMemo(
    () => [
      {
        label: 'Adeudos y pagos',
        to: '/clients?view=payments',
      },
      {
        label: 'Clientes',
        to: '/clients',
      },
    ],
    [],
  )

  if (shouldShowSkeleton) {
    return <DashboardSkeleton />
  }

  const handleRetrySync = async () => {
    try {
      await Promise.all([reloadMetrics(), reloadResellers(), reloadExpenses()])
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
    }
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
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          <span>{dataErrorMessage}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="border border-red-200 bg-white text-red-700 hover:border-red-300"
            onClick={handleRetrySync}
            disabled={isDataLoading}
          >
            Reintentar
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
                to="/clients?view=payments"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                Administrar adeudos →
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
            aria-pressed={false}
            className={metrics.pendingClients > 0 ? 'ring-2 ring-amber-200' : ''}
            description="Revisa el detalle en Clientes > Adeudos y pagos"
          />
          <StatCard
            title="Servicios activos"
            value={metrics.totalClients}
            icon={Wifi}
            trend={`${metrics.paidClients} al día / ${metrics.pendingClients} pendientes`}
            trendClassName="text-sm font-medium text-slate-500"
            valueClassName="text-3xl font-semibold text-slate-900"
          />
        </div>
      </section>

      <section aria-labelledby="ingresos" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <h3 id="ingresos" className="text-lg font-semibold text-slate-900">
              Ingresos y costos
            </h3>
            <p className="text-sm text-slate-500">
              Visión consolidada. Para cobrar, usa Clientes → Adeudos y pagos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm font-semibold text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                {link.label} →
              </Link>
            ))}
          </div>
        </div>
        <EarningsCard
          id={earningsSectionId}
          metrics={metrics}
          baseCosts={baseCosts}
          isLoading={isEarningsLoading}
          isExpanded={showEarningsBreakdown}
          onToggleExpanded={() => setShowEarningsBreakdown((current) => !current)}
        />
      </section>
    </div>
  )
}
