import React, { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Bell } from 'lucide-react'
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
    { key: 'initialize', label: 'Inicialización', status: initializeStatus },
    { key: 'clients', label: 'Clientes', status: clientsStatus },
    { key: 'payments', label: 'Pagos', status: paymentsStatus },
  ]

  const resolveStatusToken = (status) => {
    if (status?.isLoading) {
      return {
        label: 'Sincronizando',
        className:
          'border-blue-200 bg-blue-50 text-blue-700 shadow-sm shadow-blue-100/50',
      }
    }

    if (status?.error) {
      return {
        label: 'Requiere atención',
        className:
          'border-amber-200 bg-amber-50 text-amber-700 shadow-sm shadow-amber-100/40',
      }
    }

    return {
      label: 'Al día',
      className:
        'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100/40',
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
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-10 md:px-6">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-2xl shadow-slate-200/70 backdrop-blur">
          <header className="relative overflow-hidden border-b border-transparent px-6 py-6">
            <div
              className="absolute inset-0 bg-gradient-to-br from-blue-50/70 via-white to-purple-50/60"
              aria-hidden
            />
            <div className="relative flex flex-col gap-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />
                    Operación
                  </span>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Panel operativo</h1>
                    <p className="text-sm text-slate-600">Actualizado el {formatDate(new Date())}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-xs font-medium text-emerald-700">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                    Sincronización en tiempo real
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="relative rounded-full border border-blue-200 bg-white/70 p-2 text-blue-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                      aria-label="Notificaciones"
                    >
                      <Bell className="h-5 w-5" aria-hidden />
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="border border-blue-200 bg-white/80 font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
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
                  className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 shadow-sm"
                  role="alert"
                >
                  Hubo un problema al sincronizar la información. Intenta nuevamente más tarde.
                </div>
              )}
              <dl className="grid gap-4 sm:grid-cols-3">
                {statusCards.map(({ key, label, status }) => {
                  const token = resolveStatusToken(status)
                  return (
                    <div
                      key={key}
                      className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-4 shadow-inner shadow-slate-200/50"
                    >
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                      <dd className="mt-3 space-y-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${token.className}`}
                        >
                          {token.label}
                        </span>
                        <p className="text-xs text-slate-500">{resolveStatusHint(status)}</p>
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </div>
          </header>
          <BackofficeRefreshProvider value={{ isRefreshing }}>
            <main className="flex-1 overflow-y-auto bg-gradient-to-br from-white/95 via-white to-slate-50 px-4 py-6 sm:px-8">
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
