import React, { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Bell } from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import { AppSidebar } from '../components/layout/AppSidebar.jsx'
import { formatDate } from '../utils/formatters.js'
import { useBackofficeStore } from '../store/useBackofficeStore.js'
import { useToast } from '../hooks/useToast.js'

export default function BackofficeLayout() {
  const initialize = useBackofficeStore((state) => state.initialize)
  const refreshData = useBackofficeStore((state) => state.refreshData)
  const syncCurrentPeriod = useBackofficeStore((state) => state.syncCurrentPeriod)
  const initializeStatus = useBackofficeStore((state) => state.status.initialize)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    initialize()
    syncCurrentPeriod()
  }, [initialize, syncCurrentPeriod])

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
                  disabled={Boolean(initializeStatus?.isLoading) || isRefreshing}
                >
                  {initializeStatus?.isLoading || isRefreshing ? 'Sincronizando…' : 'Actualizar datos'}
                </Button>
              </div>
            </div>
            {initializeStatus?.error && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
                Hubo un problema al sincronizar la información. Intenta nuevamente más tarde.
              </div>
            )}
          </header>
          <main className="flex-1 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
