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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 md:px-6">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Panel operativo</h1>
                <p className="text-sm text-slate-500">Actualizado el {formatDate(new Date())}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="relative rounded-full bg-blue-50 p-2 text-blue-600 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                  aria-label="Notificaciones"
                >
                  <Bell className="h-5 w-5" aria-hidden />
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
                  onClick={handleRefresh}
                  disabled={Boolean(isInitializing) || isRefreshing}
                >
                  {isInitializing || isRefreshing ? 'Sincronizando…' : 'Actualizar datos'}
                </Button>
              </div>
            </div>
            {initializeStatus?.error && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
                Hubo un problema al sincronizar la información. Intenta nuevamente más tarde.
              </div>
            )}
          </header>
          <BackofficeRefreshProvider value={{ isRefreshing }}>
            <main className="flex-1 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6">
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
