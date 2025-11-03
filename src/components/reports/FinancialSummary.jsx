import React, { useMemo } from 'react'
import { peso, formatPeriodLabel } from '../../utils/formatters.js'
import { useDashboardMetrics } from '../../hooks/useDashboardMetrics.js'
import { useBackofficeStore } from '../../store/useBackofficeStore.js'

export default function FinancialSummary() {
  const { baseCosts, expenses, selectedPeriod, currentPeriod } = useBackofficeStore((state) => ({
    baseCosts: state.baseCosts,
    expenses: state.expenses,
    selectedPeriod: state.periods?.selected ?? state.periods?.current,
    currentPeriod: state.periods?.current ?? state.periods?.selected,
  }))

  const { metrics } = useDashboardMetrics()

  const base1 = baseCosts?.base1 ?? 0
  const base2 = baseCosts?.base2 ?? 0

  const operationalExpenses = useMemo(() => {
    if (!Array.isArray(expenses)) return 0
    return expenses.reduce((total, expense) => total + (expense?.amount ?? 0), 0)
  }, [expenses])

  const totalIncome = metrics.clientIncome + metrics.resellerIncome
  const totalCosts = metrics.internetCosts + metrics.totalExpenses
  const netPositive = metrics.netEarnings >= 0
  const periodLabel = useMemo(
    () => formatPeriodLabel(selectedPeriod ?? currentPeriod),
    [selectedPeriod, currentPeriod],
  )

  return (
    <section aria-labelledby="financial-summary-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            id="financial-summary-heading"
            className="text-base font-semibold text-slate-900"
          >
            Ganancias y costos
          </p>
          <p className="text-sm text-slate-500">
            Resumen del balance financiero para {periodLabel}.
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold ${
            netPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {netPositive ? 'Al día' : 'Revisar'}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saldo neto</p>
          <p className={`mt-2 text-3xl font-semibold ${netPositive ? 'text-emerald-600' : 'text-red-600'}`}>
            {peso(metrics.netEarnings)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Ingresos - (costos + gastos)</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Totales</p>
          <dl className="mt-3 space-y-2 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <dt>Total ingresos</dt>
              <dd className="font-semibold text-emerald-600">{peso(totalIncome)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Total egresos</dt>
              <dd className="font-semibold text-red-600">- {peso(totalCosts)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ingresos</p>
          <dl className="mt-3 space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <dt>Clientes</dt>
              <dd className="font-semibold text-emerald-600">{peso(metrics.clientIncome)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Revendedores</dt>
              <dd className="font-semibold text-emerald-600">{peso(metrics.resellerIncome)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Costos y gastos</p>
          <dl className="mt-3 space-y-3 text-sm text-slate-600">
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
          </dl>
        </div>
      </div>
    </section>
  )
}
