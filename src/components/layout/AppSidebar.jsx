import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  DollarSign,
  FileText,
  Home,
  Package,
  ShoppingCart,
  Settings,
  Users,
  Wifi,
} from 'lucide-react'
import { formatDate } from '../../utils/formatters.js'

const clsx = (...classes) => classes.filter(Boolean).join(' ')

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: Home },
  { to: '/clients', label: 'Clientes', icon: Users },
  { to: '/resellers', label: 'Revendedores', icon: Wifi },
  { to: '/payments', label: 'Pagos', icon: DollarSign },
  { to: '/expenses', label: 'Gastos', icon: FileText },
  { to: '/reports', label: 'Reportes', icon: BarChart3 },
  { to: '/inventory', label: 'Equipos / Inventario', icon: Package },
  { to: '/ventas', label: 'Ventas', icon: ShoppingCart },
  { to: '/settings', label: 'Configuración', icon: Settings },
]

const linkBaseClasses =
  'group relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white'

export function AppSidebar() {
  const todayLabel = formatDate(new Date())

  return (
    <aside aria-label="Menú principal" className="hidden w-72 shrink-0 md:flex">
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[32px] border border-white/50 bg-white/70 p-6 shadow-2xl shadow-slate-200/70 backdrop-blur">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-white via-white to-blue-50"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-32 -z-10 h-64 w-64 rounded-full bg-blue-200/30 blur-3xl"
        />
        <div className="relative flex flex-col gap-6">
          <div className="rounded-3xl border border-blue-100/80 bg-gradient-to-br from-blue-50 via-white to-blue-100 px-5 py-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600">
                <Wifi aria-hidden className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Red-Link Backoffice</p>
                <p className="text-xs text-slate-500">Operación diaria centralizada</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1 text-[11px] font-medium text-blue-700">
              <CalendarDays aria-hidden className="h-3.5 w-3.5" />
              <span>Hoy: {todayLabel}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <nav className="flex flex-col gap-2" aria-label="Secciones">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    clsx(
                      linkBaseClasses,
                      'border border-transparent bg-white/60 text-slate-600 shadow-sm transition hover:border-blue-100 hover:bg-blue-50/70 hover:text-blue-700',
                      isActive &&
                        'border-blue-200 bg-gradient-to-r from-blue-50 via-white to-blue-100 text-blue-700 shadow-md shadow-blue-100/80',
                    )
                  }
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 transition group-hover:bg-blue-500/20 group-hover:text-blue-700">
                    <Icon aria-hidden className="h-5 w-5" />
                  </span>
                  <span className="flex-1">{label}</span>
                  <span
                    aria-hidden
                    className="ml-auto h-2 w-2 rounded-full bg-transparent transition group-hover:bg-blue-400"
                  />
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="rounded-3xl border border-slate-200/80 bg-white/80 p-4 text-xs text-slate-500 shadow-inner">
            <p className="font-semibold text-slate-700">Centro de control</p>
            <p className="mt-1 leading-relaxed">
              Mantén tu operación sincronizada y monitorea clientes, revendedores y pagos desde un solo lugar.
            </p>
            <p className="mt-4 text-[11px] uppercase tracking-wide text-slate-400">
              © {new Date().getFullYear()} Red-Link
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
