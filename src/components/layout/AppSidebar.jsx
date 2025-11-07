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
  { to: '/ventas', label: 'Ventas', icon: ShoppingCart },
  { to: '/dashboard', label: 'Dashboard', icon: Home },
  { to: '/clients', label: 'Clientes', icon: Users },
  { to: '/resellers', label: 'Revendedores', icon: Wifi },
  { to: '/payments', label: 'Pagos', icon: DollarSign },
  { to: '/expenses', label: 'Gastos', icon: FileText },
  { to: '/reports', label: 'Reportes', icon: BarChart3 },
  { to: '/inventory', label: 'Equipos / Inventario', icon: Package },
  { to: '/settings', label: 'Configuración', icon: Settings },
]

const linkBaseClasses =
  'group flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40'

export function AppSidebar() {
  const todayLabel = formatDate(new Date())

  return (
    <aside aria-label="Menú principal" className="hidden w-72 shrink-0 md:flex">
      <div className="flex h-full w-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500">
                <Wifi aria-hidden className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Red-Link Backoffice</p>
                <p className="text-xs text-slate-500">Operación diaria centralizada</p>
              </div>
            </div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
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
                      'text-slate-600 hover:bg-slate-100',
                      isActive && 'bg-slate-900 text-white shadow-sm',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={clsx(
                          'flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-current transition group-hover:bg-slate-200',
                          isActive && 'bg-white/20 text-white',
                        )}
                      >
                        <Icon aria-hidden className="h-5 w-5" />
                      </span>
                      <span className="flex-1">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
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
