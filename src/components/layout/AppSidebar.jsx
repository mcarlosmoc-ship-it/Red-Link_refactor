import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  DollarSign,
  FileText,
  Home,
  Package,
  Settings,
  Users,
  Wifi,
} from 'lucide-react'

const navItems = [
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
  'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40'

export function AppSidebar() {
  return (
    <aside aria-label="Menú principal" className="hidden w-64 shrink-0 md:flex">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/80 p-5 shadow-xl shadow-slate-200/80 backdrop-blur">
        <div className="flex items-center gap-3 rounded-2xl border border-blue-100/80 bg-gradient-to-r from-blue-50 via-white to-blue-100 px-4 py-4 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-500/10 text-blue-600">
            <Wifi aria-hidden className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">Red-Link Backoffice</p>
            <p className="text-xs text-slate-500">Operación diaria</p>
          </div>
        </div>
        <div className="mt-6 flex-1 overflow-y-auto">
          <nav className="flex flex-col gap-2" aria-label="Secciones">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  [
                    linkBaseClasses,
                    'rounded-xl border border-transparent bg-white/70 text-slate-600 shadow-sm transition hover:border-blue-100 hover:bg-blue-50/80 hover:text-blue-700',
                    isActive
                      ? 'border-blue-200 bg-blue-50/90 text-blue-700 shadow-md shadow-blue-100/80'
                      : '',
                  ].join(' ')
                }
              >
                <Icon aria-hidden className="h-5 w-5" />
                <span>{label}</span>
                <span
                  aria-hidden
                  className="ml-auto h-2 w-2 rounded-full bg-transparent transition group-hover:bg-blue-300"
                />
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-xs text-slate-500 shadow-inner">
          © {new Date().getFullYear()} Red-Link
        </div>
      </div>
    </aside>
  )
}
