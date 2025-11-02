import React, { useMemo, useState } from 'react'
import { peso, today } from '../utils/formatters.js'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { useBackofficeStore } from '../store/useBackofficeStore.js'

const defaultExpense = {
  date: today(),
  desc: '',
  cat: 'Operativo',
  amount: '',
  base: 1,
}

export default function ExpensesPage() {
  const { expenses, addExpense } = useBackofficeStore((state) => ({
    expenses: state.expenses,
    addExpense: state.addExpense,
  }))
  const [form, setForm] = useState(defaultExpense)
  const [formErrors, setFormErrors] = useState({})
  const [categoryFilter, setCategoryFilter] = useState('Todos')

  const categories = useMemo(() => {
    const set = new Set(['Operativo', 'Materiales', 'Gasolina'])
    expenses.forEach((expense) => set.add(expense.cat))
    return Array.from(set)
  }, [expenses])

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => categoryFilter === 'Todos' || expense.cat === categoryFilter)
  }, [expenses, categoryFilter])

  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + (expense.amount ?? 0), 0)

  const validate = () => {
    const errors = {}
    if (!form.desc.trim()) errors.desc = 'Describe brevemente el gasto.'
    if (!form.date) errors.date = 'Selecciona una fecha.'
    if (!form.amount || Number(form.amount) <= 0) errors.amount = 'Ingresa un monto mayor a cero.'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!validate()) return
    addExpense({
      date: form.date,
      desc: form.desc.trim(),
      cat: form.cat,
      amount: Number(form.amount),
      base: Number(form.base) || 0,
    })
    setForm(defaultExpense)
    setFormErrors({})
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="gastos" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="gastos" className="text-lg font-semibold text-slate-900">
              Gastos operativos
            </h2>
            <p className="text-sm text-slate-500">
              Mantén un registro claro de combustibles, materiales y costos adicionales por base.
            </p>
          </div>
          <div className="text-sm font-medium text-slate-600">Total filtrado: {peso(totalExpenses)}</div>
        </div>

        <Card>
          <CardContent className="space-y-4">
            <label className="grid w-full gap-1 text-xs font-medium text-slate-600 sm:max-w-xs">
              Categoría
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Todos">Todas</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Fecha
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Descripción
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Categoría
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Base
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Monto
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="px-3 py-2 text-slate-600">{expense.date}</td>
                      <td className="px-3 py-2 text-slate-700">{expense.desc}</td>
                      <td className="px-3 py-2 text-slate-600">{expense.cat}</td>
                      <td className="px-3 py-2 text-slate-600">Base {expense.base}</td>
                      <td className="px-3 py-2 text-slate-600">{peso(expense.amount)}</td>
                    </tr>
                  ))}
                  {filteredExpenses.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                        No hay gastos registrados para la categoría seleccionada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="nuevo-gasto" className="space-y-4">
        <div>
          <h2 id="nuevo-gasto" className="text-lg font-semibold text-slate-900">
            Registrar gasto
          </h2>
          <p className="text-sm text-slate-500">
            Captura el gasto con una breve descripción y asigna la base correspondiente.
          </p>
        </div>

        <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Fecha
              <input
                type="date"
                value={form.date}
                onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                className={`rounded-md border px-3 py-2 text-sm ${
                  formErrors.date ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : 'border-slate-300'
                }`}
              />
              {formErrors.date && <span className="text-xs text-red-600">{formErrors.date}</span>}
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Categoría
              <select
                value={form.cat}
                onChange={(event) => setForm((prev) => ({ ...prev, cat: event.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600 md:col-span-2">
              Descripción
              <input
                value={form.desc}
                onChange={(event) => setForm((prev) => ({ ...prev, desc: event.target.value }))}
                className={`rounded-md border px-3 py-2 text-sm ${
                  formErrors.desc ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : 'border-slate-300'
                }`}
                placeholder="Ej. Pago gasolina"
              />
              {formErrors.desc && <span className="text-xs text-red-600">{formErrors.desc}</span>}
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Monto
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                className={`rounded-md border px-3 py-2 text-sm ${
                  formErrors.amount ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : 'border-slate-300'
                }`}
              />
              {formErrors.amount && <span className="text-xs text-red-600">{formErrors.amount}</span>}
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Base
              <select
                value={form.base}
                onChange={(event) => setForm((prev) => ({ ...prev, base: Number(event.target.value) }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value={1}>Base 1</option>
                <option value={2}>Base 2</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
              onClick={() => {
                setForm(defaultExpense)
                setFormErrors({})
              }}
            >
              Cancelar
            </Button>
            <Button type="submit">Registrar gasto</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
