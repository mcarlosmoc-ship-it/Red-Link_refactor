import React, { useMemo } from 'react'
import { peso } from '../../utils/formatters.js'
import { useDashboardMetrics } from '../../hooks/useDashboardMetrics.js'
import { useBackofficeStore } from '../../store/useBackofficeStore.js'

export function SidebarFinancialSummary() {
  const { baseCosts, expenses } = useBackofficeStore((state) => ({
    baseCosts: state.baseCosts,
    expenses: state.expenses,
  }))

  const { metrics } = useDashboardMetrics({ statusFilter: 'all', searchTerm: '' })

  const base1 = baseCosts?.base1 ?? 0
  const base2 = baseCosts?.base2 ?? 0

  const operationalExpenses = useMemo(() => {
    if (!Array.isArray(expenses)) return 0
    return expenses.reduce((total, expense) => total + (expense?.amount ?? 0), 0)
  }, [expenses])

  const totalIncome = metrics.clientIncome + metrics.resellerIncome
  const totalCosts = metrics.internetCosts + metrics.totalExpenses
  const netPositive = metrics.netEarnings >= 0

  return (
    <section
      aria-labelledby="sidebar-financial-heading"
      className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p id="sidebar-financial-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ganancias y costos
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Resumen rápido del periodo actual.</p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold ${
            netPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {netPositive ? 'Al día' : 'Revisar'}
        </span>
      </div>

      <div className="rounded-xl bg-white/80 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Saldo neto</p>
        <p className={`mt-1 text-lg font-semibold ${netPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {peso(metrics.netEarnings)}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">Ingresos - (costos + gastos)</p>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ingresos</p>
          <dl className="mt-2 space-y-2 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <dt>Clientes</dt>
              <dd className="font-semibold text-emerald-600">{peso(metrics.clientIncome)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Revendedores</dt>
              <dd className="font-semibold text-emerald-600">{peso(metrics.resellerIncome)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-2 text-slate-500">
              <dt>Total ingresos</dt>
              <dd className="font-semibold text-slate-900">{peso(totalIncome)}</dd>
            </div>
          </dl>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Costos y gastos</p>
          <dl className="mt-2 space-y-2 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <dt>Base 1</dt>
              <dd className="font-semibold text-red-600">- {peso(base1)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Base 2</dt>
              <dd className="font-semibold text-red-600">- {peso(base2)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Gastos operativos</dt>
              <dd className="font-semibold text-red-600">- {peso(operationalExpenses)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-2 text-slate-500">
              <dt>Total egresos</dt>
              <dd className="font-semibold text-slate-900">- {peso(totalCosts)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}

