import React, { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Bell, CalendarDays, CreditCard, Sparkles, Users } from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import { AppSidebar } from '../components/layout/AppSidebar.jsx'
import { formatDate } from '../utils/formatters.js'
import { useBackofficeStore } from '../store/useBackofficeStore.js'
import { useToast } from '../hooks/useToast.js'
import { BackofficeRefreshProvider } from '../contexts/BackofficeRefreshContext.jsx'
import { useInitializeBackoffice } from '../hooks/useInitializeBackoffice.js'

class BackofficeErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Backoffice layout error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ error: null })
    if (this.props.onRetry) {
      this.props.onRetry()
    }
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">Ocurrió un error inesperado</h2>
            <p className="text-sm text-slate-600">
              No se pudo cargar el panel en este momento. Intenta nuevamente.
            </p>
          </div>
          <Button type="button" onClick={this.handleRetry}>
            Reintentar
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}

export default function BackofficeLayout() {
  const refreshData = useBackofficeStore((state) => state.refreshData)
  const initializeStatus = useBackofficeStore((state) => state.status.initialize)
  const clientsStatus = useBackofficeStore((state) => state.status.clients)
  const paymentsStatus = useBackofficeStore((state) => state.status.payments)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { showToast } = useToast()
  const { isLoading: isInitializing, retry } = useInitializeBackoffice()
  const lastClientsErrorRef = useRef(null)
  const lastPaymentsErrorRef = useRef(null)

  useEffect(() => {
    if (clientsStatus?.error && lastClientsErrorRef.current !== clientsStatus.error) {
      showToast({
        type: 'error',
        title: 'No se pudieron sincronizar los clientes',
        description: clientsStatus.error,
      })
      lastClientsErrorRef.current = clientsStatus.error
    } else if (!clientsStatus?.error) {
      lastClientsErrorRef.current = null
    }
  }, [clientsStatus?.error, showToast])

  useEffect(() => {
    if (paymentsStatus?.error && lastPaymentsErrorRef.current !== paymentsStatus.error) {
      showToast({
        type: 'error',
        title: 'No se pudieron cargar los pagos',
        description: paymentsStatus.error,
      })
      lastPaymentsErrorRef.current = paymentsStatus.error
    } else if (!paymentsStatus?.error) {
      lastPaymentsErrorRef.current = null
    }
  }, [paymentsStatus?.error, showToast])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshData()
      showToast({
        type: 'success',
        title: 'Datos actualizados',
        description: 'La información se sincronizó correctamente.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Error al actualizar los datos',
        description: error?.message ?? 'Intenta nuevamente más tarde.',
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  const statusCards = [
    { key: 'initialize', label: 'Inicialización', status: initializeStatus, icon: Sparkles },
    { key: 'clients', label: 'Clientes', status: clientsStatus, icon: Users },
    { key: 'payments', label: 'Pagos', status: paymentsStatus, icon: CreditCard },
  ]

  const resolveStatusTheme = (status) => {
    if (status?.isLoading) {
      return {
        label: 'Sincronizando',
        badgeClass: 'bg-blue-500/10 text-blue-600 ring-1 ring-inset ring-blue-200',
        dotClass: 'bg-blue-500',
        iconBg: 'bg-blue-500/10',
        iconColor: 'text-blue-600',
      }
    }

    if (status?.error) {
      return {
        label: 'Requiere atención',
        badgeClass: 'bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-200',
        dotClass: 'bg-amber-500',
        iconBg: 'bg-amber-500/10',
        iconColor: 'text-amber-600',
      }
    }

    return {
      label: 'Al día',
      badgeClass: 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-200',
      dotClass: 'bg-emerald-500',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-600',
    }
  }

  const resolveStatusHint = (status) => {
    if (status?.isLoading) {
      return 'Estamos sincronizando la información más reciente.'
    }

    if (status?.error) {
      return 'Hay incidencias pendientes por revisar.'
    }

    if (status?.lastFetchedAt) {
      return `Actualizado ${formatDate(status.lastFetchedAt)}`
    }

    return 'Sin sincronizaciones registradas todavía.'
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.12),transparent_50%)]"
      />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-10 text-slate-900 md:px-6 lg:flex-row">
        <AppSidebar />
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-[32px] border border-white/60 bg-white/80 shadow-[0_25px_70px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
          <header className="relative overflow-hidden border-b border-white/60 px-6 py-8 sm:px-8">
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-white to-purple-50/60"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-blue-200/40 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -left-24 bottom-0 h-48 w-48 rounded-full bg-purple-200/30 blur-3xl"
            />
            <div className="relative flex flex-col gap-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-4">
                  <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-white/70 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-blue-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />
                    Operación
                  </span>
                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Panel operativo en vivo</h1>
                    <p className="max-w-xl text-sm text-slate-600">
                      Gestiona clientes, revendedores y pagos con indicadores actualizados y alertas inmediatas.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-slate-600">
                      <CalendarDays aria-hidden className="h-4 w-4 text-blue-500" />
                      Actualizado el {formatDate(new Date())}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/60 px-3 py-1 text-slate-600">
                      <span
                        aria-hidden
                        className={`h-2 w-2 rounded-full ${isRefreshing ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'}`}
                      />
                      {isRefreshing ? 'Sincronizando datos…' : 'Datos al día'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/70 px-4 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                    Sincronización en tiempo real
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="relative rounded-full border border-blue-200 bg-white/70 p-2.5 text-blue-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                      aria-label="Notificaciones"
                    >
                      <Bell className="h-5 w-5" aria-hidden />
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="border border-blue-200 bg-white/80 px-5 py-2 font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                      onClick={handleRefresh}
                      disabled={Boolean(isInitializing) || isRefreshing}
                    >
                      {isInitializing || isRefreshing ? 'Sincronizando…' : 'Actualizar datos'}
                    </Button>
                  </div>
                </div>
              </div>
              {initializeStatus?.error && (
                <div
                  className="relative overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800 shadow-sm"
                  role="alert"
                >
                  <div className="absolute inset-y-0 left-0 w-1 bg-amber-400" aria-hidden />
                  Hubo un problema al sincronizar la información. Intenta nuevamente más tarde.
                </div>
              )}
              <dl className="grid gap-4 sm:grid-cols-3">
                {statusCards.map(({ key, label, status, icon: Icon }) => {
                  const theme = resolveStatusTheme(status)
                  return (
                    <div
                      key={key}
                      className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-50/0 via-blue-50/0 to-blue-100/40 opacity-0 transition group-hover:opacity-100"
                      />
                      <div className="relative flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${theme.iconBg} ${theme.iconColor}`}>
                              <Icon className="h-5 w-5" aria-hidden />
                            </span>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                          </div>
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${theme.badgeClass}`}
                          >
                            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${theme.dotClass}`} />
                            {theme.label}
                          </span>
                        </div>
                        <dd className="text-xs text-slate-500">{resolveStatusHint(status)}</dd>
                      </div>
                    </div>
                  )
                })}
              </dl>
            </div>
          </header>
          <BackofficeRefreshProvider value={{ isRefreshing }}>
            <main className="flex-1 overflow-y-auto bg-gradient-to-br from-white/95 via-white to-slate-50 px-5 py-8 sm:px-10">
              <BackofficeErrorBoundary onRetry={retry}>
                <Outlet />
              </BackofficeErrorBoundary>
            </main>
          </BackofficeRefreshProvider>
        </div>
      </div>
    </div>
  )
}
