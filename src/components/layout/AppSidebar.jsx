import React from 'react'
import { NavLink } from 'react-router-dom'
import { DollarSign, FileText, Home, Settings, Users, Wifi } from 'lucide-react'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: Home },
  { to: '/clients', label: 'Clientes', icon: Users },
  { to: '/resellers', label: 'Revendedores', icon: Wifi },
  { to: '/payments', label: 'Pagos', icon: DollarSign },
  { to: '/expenses', label: 'Gastos', icon: FileText },
  { to: '/settings', label: 'Configuración', icon: Settings },
]

const linkBaseClasses =
  'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40'

export function AppSidebar() {
  return (
    <aside
      aria-label="Menú principal"
      className="hidden w-64 shrink-0 border-r border-slate-200 bg-white/90 backdrop-blur md:block"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Wifi aria-hidden className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Red-Link Backoffice</p>
            <p className="text-xs text-slate-500">Operación diaria</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-4 py-4" aria-label="Secciones">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  linkBaseClasses,
                  isActive
                    ? 'bg-blue-50 text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                ].join(' ')
              }
            >
              <Icon aria-hidden className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          ))
        </nav>
        <div className="border-t border-slate-200 px-6 py-4 text-xs text-slate-500">
          © {new Date().getFullYear()} Red-Link
        </div>
      </div>
    </aside>
  )
}
