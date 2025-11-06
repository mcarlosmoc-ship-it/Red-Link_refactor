import React, { useMemo } from 'react'
import { Card, CardContent } from '../ui/Card.jsx'
import { peso } from '../../utils/formatters.js'

export default function EarningsCard({
  earningsDemo,
  clientIncomeDemo,
  resellerIncomeDemo,
  baseCosts,
  expenses,
}) {
  const internetCosts = useMemo(() => {
    const base1 = baseCosts?.base1 ?? 0
    const base2 = baseCosts?.base2 ?? 0
    return base1 + base2
  }, [baseCosts])

  const operationalExpenses = useMemo(() => {
    if (!Array.isArray(expenses)) return 0
    return expenses.reduce((total, expense) => total + (expense?.amount ?? 0), 0)
  }, [expenses])

  const netEarnings = useMemo(() => {
    if (typeof earningsDemo === 'number') return earningsDemo
    const clientIncome = clientIncomeDemo ?? 0
    const resellerIncome = resellerIncomeDemo ?? 0
    return clientIncome + resellerIncome - internetCosts - operationalExpenses
  }, [earningsDemo, clientIncomeDemo, resellerIncomeDemo, internetCosts, operationalExpenses])

  const totalIncome = (clientIncomeDemo ?? 0) + (resellerIncomeDemo ?? 0)
  const netPositive = netEarnings >= 0
  const hasIncome = totalIncome > 0
  const margin = hasIncome ? (netEarnings / totalIncome) * 100 : 0
  const normalizedMargin = Number.isFinite(margin)
    ? Math.max(0, Math.min(100, Math.abs(margin)))
    : 0

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50/40 via-white to-blue-50/30"
      />
      <CardContent className="relative z-10 p-6 sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">Resumen de ganancias</h2>
            <p className="text-sm text-slate-500">Desglose estimado del periodo actual</p>
          </div>
          <div className={`flex items-center gap-3 self-start rounded-full px-4 py-2 text-sm font-semibold ${netPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            <span>Ganancia estimada</span>
            <span className="text-base">{peso(netEarnings)}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 shadow-inner shadow-slate-200/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ingresos</p>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>Clientes</span>
                <span className="font-semibold text-emerald-600">{peso(clientIncomeDemo ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Revendedores</span>
                <span className="font-semibold text-emerald-600">{peso(resellerIncomeDemo ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-3 text-sm">
                <span>Total ingresos</span>
                <span className="font-semibold text-slate-900">{peso(totalIncome)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 shadow-inner shadow-slate-200/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Costos y gastos</p>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>Base 1</span>
                <span className="font-semibold text-red-600">- {peso(baseCosts?.base1 ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Base 2</span>
                <span className="font-semibold text-red-600">- {peso(baseCosts?.base2 ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Gastos operativos</span>
                <span className="font-semibold text-red-600">- {peso(operationalExpenses)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-3 text-sm">
                <span>Total egresos</span>
                <span className="font-semibold text-slate-900">- {peso(internetCosts + operationalExpenses)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4 rounded-2xl border border-dashed border-slate-200/80 bg-white/70 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-600">Resultado neto del periodo</p>
              <p className="text-xs text-slate-500">Ingresos - (costos + gastos)</p>
            </div>
            <p className={`text-2xl font-semibold ${netPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              {peso(netEarnings)}
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Margen estimado</span>
              <span className={`${netPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                {hasIncome ? `${margin.toFixed(1)}%` : 'Sin datos'}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${netPositive ? 'bg-emerald-500' : 'bg-red-500'}`}
                style={{ width: `${normalizedMargin}%` }}
                aria-hidden
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
