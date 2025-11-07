import React, { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { CalendarDays, RefreshCw, Users, Wallet } from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import { AppSidebar } from '../components/layout/AppSidebar.jsx'
import { formatDate } from '../utils/formatters.js'
import { useBackofficeStore } from '../store/useBackofficeStore.js'
import { useToast } from '../hooks/useToast.js'
import { BackofficeRefreshProvider } from '../contexts/BackofficeRefreshContext.jsx'
import { useInitializeBackoffice } from '../hooks/useInitializeBackoffice.js'

const cx = (...classes) => classes.filter(Boolean).join(' ')

const toneStyles = {
  success: {
    icon: 'bg-emerald-50 text-emerald-600',
    chip: 'bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20',
  },
  info: {
    icon: 'bg-sky-50 text-sky-600',
    chip: 'bg-sky-500/10 text-sky-600 ring-1 ring-inset ring-sky-500/20',
  },
  warning: {
    icon: 'bg-amber-50 text-amber-600',
    chip: 'bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/20',
  },
}

const parseStatusSummary = (status, { successMessage }) => {
  if (status?.isLoading) {
    return {
      tone: 'info',
      title: 'Sincronizando…',
      description: 'Estamos consultando los datos más recientes para mantenerte al día.',
    }
  }

  if (status?.error) {
    return {
      tone: 'warning',
      title: 'Revisión requerida',
      description: status.error,
    }
  }

  return {
    tone: 'success',
    title: 'Todo en orden',
    description: successMessage,
  }
}

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

  const syncSummary = parseStatusSummary(initializeStatus, {
    successMessage: 'Sincronización estable y lista para trabajar.',
  })
  const clientsSummary = parseStatusSummary(clientsStatus, {
    successMessage: 'Clientes disponibles para gestionar sin contratiempos.',
  })
  const paymentsSummary = parseStatusSummary(paymentsStatus, {
    successMessage: 'Pagos registrados correctamente y listos para conciliar.',
  })

  const statusHighlights = [
    { label: 'Sincronización', icon: RefreshCw, summary: syncSummary },
    { label: 'Clientes', icon: Users, summary: clientsSummary },
    { label: 'Pagos', icon: Wallet, summary: paymentsSummary },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-100 to-slate-200 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-10 md:px-8 lg:flex-row">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden rounded-[28px] border border-white/60 bg-white/80 shadow-2xl shadow-slate-900/5 backdrop-blur">
          <header className="border-b border-white/60 bg-white/80 px-6 py-6 sm:px-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden />
                  Panel operativo
                </span>
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Red-Link Backoffice</h1>
                  <p className="max-w-xl text-sm leading-relaxed text-slate-500">
                    Gestiona clientes, revendedores y pagos con una interfaz ligera y enfocada. Mantén tu operación alineada sin distracciones visuales.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-xs text-slate-500 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-600">
                    <CalendarDays aria-hidden className="h-4 w-4" />
                    <span className="text-sm font-medium text-slate-700">Actualizado el {formatDate(new Date())}</span>
                  </div>
                  <span
                    className={cx(
                      'mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em]',
                      isRefreshing || isInitializing
                        ? 'bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/30',
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
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl border-transparent bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800 focus-visible:ring-slate-500/40 sm:w-auto"
                  onClick={handleRefresh}
                  aria-busy={Boolean(isInitializing) || isRefreshing}
                  disabled={Boolean(isInitializing) || isRefreshing}
                >
                  {isInitializing || isRefreshing ? 'Sincronizando…' : 'Actualizar datos'}
                </Button>
              </div>
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {statusHighlights.map(({ label, icon: Icon, summary }) => {
                const tone = toneStyles[summary.tone] ?? toneStyles.info
                return (
                  <li
                    key={label}
                    className="group flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-900/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={cx(
                            'flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold transition',
                            tone.icon,
                          )}
                        >
                          <Icon aria-hidden className="h-5 w-5" />
                        </span>
                        <span className="text-sm font-semibold text-slate-700">{label}</span>
                      </div>
                      <span className={cx('inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold', tone.chip)}>
                        {summary.title}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-500">{summary.description}</p>
                  </li>
                )
              })}
            </ul>
            {initializeStatus?.error && (
              <div
                className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
                role="alert"
              >
                Hubo un problema al sincronizar la información. Intenta nuevamente más tarde.
              </div>
            )}
          </header>
          <BackofficeRefreshProvider value={{ isRefreshing }}>
            <main className="flex-1 overflow-y-auto bg-gradient-to-b from-white/70 via-white to-slate-50 px-6 py-8 sm:px-10">
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
