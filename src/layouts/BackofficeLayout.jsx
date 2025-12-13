import React, { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import { AppSidebar } from '../components/layout/AppSidebar.jsx'
import { AccessTokenAlert } from '../components/layout/AccessTokenAlert.jsx'
import { formatDate } from '../utils/formatters.js'
import { useBackofficeStore } from '../store/useBackofficeStore.js'
import { useToast } from '../hooks/useToast.js'
import { BackofficeRefreshProvider } from '../contexts/BackofficeRefreshContext.jsx'
import { useInitializeBackoffice } from '../hooks/useInitializeBackoffice.js'
import { apiClient } from '../services/apiClient.js'

const cx = (...classes) => classes.filter(Boolean).join(' ')

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
  const apiBaseUrl = apiClient.getBaseUrl()

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-100 to-slate-200 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-10 md:px-8 lg:flex-row">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden rounded-[28px] border border-white/60 bg-white/80 shadow-2xl shadow-slate-900/5 backdrop-blur">
          <header className="border-b border-white/60 bg-white/80 px-6 py-5 sm:px-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Red-Link Backoffice</h1>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                    <CalendarDays aria-hidden className="h-4 w-4" />
                    Actualizado el {formatDate(new Date())}
                  </span>
                  <span
                    className={cx(
                      'inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium',
                      isRefreshing || isInitializing
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cx(
                        'h-2 w-2 rounded-full',
                        isRefreshing || isInitializing ? 'animate-pulse bg-amber-500' : 'bg-emerald-500',
                      )}
                    />
                    {isRefreshing || isInitializing ? 'Sincronizando datos' : 'Datos al día'}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-lg border-slate-900/10 bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:ring-slate-500/40 sm:w-auto"
                onClick={handleRefresh}
                aria-busy={Boolean(isInitializing) || isRefreshing}
                disabled={Boolean(isInitializing) || isRefreshing}
              >
                {isInitializing || isRefreshing ? 'Sincronizando…' : 'Actualizar datos'}
              </Button>
            </div>
            {initializeStatus?.error && (
              <div
                className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                role="alert"
                aria-live="assertive"
              >
                <p className="font-semibold">Hubo un problema al sincronizar la información.</p>
                <p className="leading-relaxed">{initializeStatus.error}</p>
                <p className="text-xs text-amber-700">
                  Verifica que el backend esté en ejecución en
                  <span className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px]">{apiBaseUrl}</span>
                  y que la variable <code className="font-mono text-[11px]">VITE_API_BASE_URL</code> apunte a esa URL.
                  Si la API requiere autenticación, configura <code className="font-mono text-[11px]">VITE_API_ACCESS_TOKEN</code>
                  o usa <code className="font-mono text-[11px]">window.__RED_LINK_API_CLIENT__.setAccessToken()</code> desde la consola.
                </p>
              </div>
            )}
            <AccessTokenAlert />
          </header>
          <BackofficeRefreshProvider value={{ isRefreshing }}>
            <main className="flex-1 overflow-y-auto bg-gradient-to-b from-white/70 via-white to-slate-50 px-6 py-8 sm:px-10">
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
                <BackofficeErrorBoundary onRetry={retry}>
                  <Outlet />
                </BackofficeErrorBoundary>
              </div>
            </main>
          </BackofficeRefreshProvider>
        </div>
      </div>
    </div>
  )
}
