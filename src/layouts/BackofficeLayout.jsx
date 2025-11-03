import React, { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Bell } from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import { AppSidebar } from '../components/layout/AppSidebar.jsx'
import { today } from '../utils/formatters.js'
import { useBackofficeStore } from '../store/useBackofficeStore.js'

export default function BackofficeLayout() {
  const resetDemoData = useBackofficeStore((state) => state.resetDemoData)
  const syncCurrentPeriod = useBackofficeStore((state) => state.syncCurrentPeriod)

  useEffect(() => {
    syncCurrentPeriod()
  }, [syncCurrentPeriod])

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 md:px-6">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Panel operativo</h1>
                <p className="text-sm text-slate-500">Actualizado el {today()}</p>
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
                  onClick={resetDemoData}
                >
                  Restablecer demo
                </Button>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
