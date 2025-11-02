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

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Resumen de ganancias</h2>
            <p className="mt-1 text-sm text-gray-500">Desglose estimado del periodo actual</p>
          </div>
          <div className="flex items-center gap-3 self-start rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            <span>Ganancia estimada</span>
            <span className="text-base">{peso(netEarnings)}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">Ingresos</p>
            <div className="mt-3 space-y-3 text-sm text-gray-700">
              <div className="flex items-center justify-between">
                <span>Clientes</span>
                <span className="font-semibold text-emerald-600">{peso(clientIncomeDemo ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Revendedores</span>
                <span className="font-semibold text-emerald-600">{peso(resellerIncomeDemo ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-gray-300 pt-3 text-sm">
                <span>Total ingresos</span>
                <span className="font-semibold text-gray-900">{peso(totalIncome)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">Costos y gastos</p>
            <div className="mt-3 space-y-3 text-sm text-gray-700">
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
              <div className="flex items-center justify-between border-t border-dashed border-gray-300 pt-3 text-sm">
                <span>Total egresos</span>
                <span className="font-semibold text-gray-900">- {peso(internetCosts + operationalExpenses)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Resultado neto del periodo</p>
              <p className="text-xs text-gray-500">Ingresos - (costos + gastos)</p>
            </div>
            <p className={`text-2xl font-semibold ${netEarnings >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {peso(netEarnings)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
