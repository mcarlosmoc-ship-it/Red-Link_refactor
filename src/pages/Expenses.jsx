import React, { useMemo, useState } from 'react'
import { peso, today } from '../utils/formatters.js'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { useBackofficeStore } from '../store/useBackofficeStore.js'
import { useBackofficeRefresh } from '../contexts/BackofficeRefreshContext.jsx'
import ExpensesSkeleton from './ExpensesSkeleton.jsx'
import { useToast } from '../hooks/useToast.js'
import FormField from '../components/ui/FormField.jsx'

const createDefaultExpense = () => ({
  date: today(),
  desc: '',
  cat: 'Operativo',
  amount: '',
  base: 1,
})

export default function ExpensesPage() {
  const { expenses, addExpense, initializeStatus } = useBackofficeStore((state) => ({
    expenses: state.expenses,
    addExpense: state.addExpense,
    initializeStatus: state.status.initialize,
  }))
  const { isRefreshing } = useBackofficeRefresh()
  const { showToast } = useToast()
  const [form, setForm] = useState(() => createDefaultExpense())
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
  const shouldShowSkeleton = Boolean(initializeStatus?.isLoading) || isRefreshing

  if (shouldShowSkeleton) {
    return <ExpensesSkeleton />
  }

  const validateExpenseField = (field, value) => {
    switch (field) {
      case 'desc': {
        return value.trim() ? '' : 'Describe brevemente el gasto.'
      }
      case 'date': {
        return value ? '' : 'Selecciona una fecha.'
      }
      case 'amount': {
        const amountValue = Number(value)
        if (!Number.isFinite(amountValue) || amountValue <= 0) {
          return 'Ingresa un monto mayor a cero.'
        }
        return ''
      }
      default:
        return ''
    }
  }

  const validateForm = (nextForm = form) => {
    const errors = {}
    ;['date', 'desc', 'amount'].forEach((field) => {
      const message = validateExpenseField(field, nextForm[field])
      if (message) {
        errors[field] = message
      }
    })
    setFormErrors(errors)
    return errors
  }

  const updateFormField = (field, value) => {
    const nextForm = { ...form, [field]: value }
    setForm(nextForm)
    const message = validateExpenseField(field, value)
    setFormErrors((prev) => {
      const nextErrors = { ...prev }
      if (message) {
        nextErrors[field] = message
      } else {
        delete nextErrors[field]
      }
      return nextErrors
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      showToast({
        type: 'error',
        title: 'Revisa la información',
        description: 'Corrige los campos marcados para guardar el gasto.',
      })
      return
    }
    try {
      await addExpense({
        date: form.date,
        desc: form.desc.trim(),
        cat: form.cat,
        amount: Number(form.amount),
        base: Number(form.base) || 0,
      })
      setForm(createDefaultExpense())
      setFormErrors({})
      showToast({
        type: 'success',
        title: 'Gasto registrado',
        description: 'El movimiento se agregó al panel operativo.',
      })
    } catch (error) {
      const message = error?.message ?? 'No se pudo registrar el gasto.'
      setFormErrors({ submit: message })
      showToast({
        type: 'error',
        title: 'Error al registrar',
        description: message,
      })
    }
  }

  return (
    <div className="space-y-8">
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
            <FormField
              label="Fecha"
              htmlFor="expense-date"
              status={formErrors.date ? 'error' : form.date ? 'success' : 'default'}
              message={formErrors.date ?? 'Selecciona el día en que se incurrió el gasto.'}
            >
              <input
                type="date"
                value={form.date}
                onChange={(event) => updateFormField('date', event.target.value)}
              />
            </FormField>

            <FormField
              label="Categoría"
              htmlFor="expense-category"
              status="default"
              message="Agrupa los movimientos para filtrarlos rápidamente."
            >
              <select
                value={form.cat}
                onChange={(event) => setForm((prev) => ({ ...prev, cat: event.target.value }))}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label="Descripción"
              htmlFor="expense-desc"
              status={formErrors.desc ? 'error' : form.desc ? 'success' : 'default'}
              message={formErrors.desc ?? 'Ej. Pago gasolina o compra de material.'}
            >
              <input
                value={form.desc}
                onChange={(event) => updateFormField('desc', event.target.value)}
                placeholder="Ej. Pago gasolina"
              />
            </FormField>

            <FormField
              label="Monto"
              htmlFor="expense-amount"
              status={formErrors.amount ? 'error' : form.amount ? 'success' : 'default'}
              message={formErrors.amount ?? 'Usa centavos si aplica (ej. 120.50).'}
              tooltip="Ingresa el monto exacto que se descontará de la base seleccionada."
            >
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(event) => updateFormField('amount', event.target.value)}
              />
            </FormField>

            <FormField
              label="Base"
              htmlFor="expense-base"
              status="default"
              message="Define a qué base se le cargará este gasto."
              tooltip="Usa la base para separar costos operativos por cuadrilla."
            >
              <select
                value={form.base}
                onChange={(event) => setForm((prev) => ({ ...prev, base: Number(event.target.value) }))}
              >
                <option value={1}>Base 1</option>
                <option value={2}>Base 2</option>
              </select>
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            {formErrors.submit && (
              <p className="flex-1 text-xs text-red-600">{formErrors.submit}</p>
            )}
            <Button
              type="button"
              variant="ghost"
              className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
              onClick={() => {
                setForm(createDefaultExpense())
                setFormErrors({})
              }}
            >
              Cancelar
            </Button>
            <Button type="submit">Registrar gasto</Button>
          </div>
        </form>
      </section>

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
                <option value="Todos">Todos</option>
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
    </div>
  )
}
