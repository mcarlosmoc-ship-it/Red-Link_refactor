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
import { useRoutePrefetch } from '../../hooks/useRoutePrefetch.js'
import { loadClientsPage, loadDashboardPage } from '../../routes/routeLoaders.js'

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

const prefetchRoutes = {
  '/dashboard': loadDashboardPage,
  '/clients': loadClientsPage,
}

const linkBaseClasses =
  'group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30'

export function AppSidebar() {
  const todayLabel = formatDate(new Date())
  const prefetch = useRoutePrefetch()

  return (
    <aside aria-label="Menú principal" className="hidden w-72 shrink-0 md:flex">
      <div className="flex h-full w-full flex-col gap-6 rounded-[28px] border border-white/60 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur">
        <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 px-5 py-6 text-white shadow-sm shadow-slate-900/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
                <Wifi aria-hidden className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">Red-Link Backoffice</p>
                <p className="text-xs text-white/70">Operación diaria centralizada</p>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70">
              Activo
            </span>
          </div>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/80">
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
                onMouseEnter={() => prefetch(prefetchRoutes[to], to)}
                onFocus={() => prefetch(prefetchRoutes[to], to)}
                className={({ isActive }) =>
                  clsx(
                    linkBaseClasses,
                    'text-slate-600 hover:bg-white/70 hover:text-slate-900',
                    isActive && 'bg-slate-900 text-white shadow-lg shadow-slate-900/10',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={clsx(
                        'flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-current transition group-hover:bg-slate-200',
                        isActive && 'bg-white/15 text-white',
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
        <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 text-xs text-slate-500 shadow-sm">
          <p className="font-semibold text-slate-700">Centro de control</p>
          <p className="mt-1 leading-relaxed">
            Mantén tu operación sincronizada y monitorea clientes, revendedores y pagos desde un solo lugar.
          </p>
          <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-slate-400">
            © {new Date().getFullYear()} Red-Link
          </p>
        </div>
      </div>
    </aside>
  )
}
