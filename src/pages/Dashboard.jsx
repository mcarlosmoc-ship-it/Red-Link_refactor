import React, { useMemo, useState } from 'react'
import { DollarSign, Users, Wifi } from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import StatCard from '../components/dashboard/StatCard.jsx'
import { peso } from '../utils/formatters.js'
import { useDashboardMetrics } from '../hooks/useDashboardMetrics.js'
import { useBackofficeStore } from '../store/useBackofficeStore.js'

const STATUS_FILTERS = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'paid', label: 'Al día' },
  { value: 'all', label: 'Todos' },
]

export default function DashboardPage() {
  const [statusFilter, setStatusFilter] = useState('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [paymentForm, setPaymentForm] = useState({ open: false, clientId: '', months: 1, method: 'Efectivo', note: '' })

  const { metrics, filteredClients } = useDashboardMetrics({ statusFilter, searchTerm })
  const { clients, recordPayment } = useBackofficeStore((state) => ({
    clients: state.clients,
    recordPayment: state.recordPayment,
  }))

  const activeClient = useMemo(
    () => clients.find((client) => client.id === paymentForm.clientId) ?? null,
    [clients, paymentForm.clientId],
  )

  const handleSubmitPayment = (event) => {
    event.preventDefault()
    if (!paymentForm.clientId) {
      setFeedback({ type: 'error', message: 'Selecciona un cliente para registrar el pago.' })
      return
    }
    const months = Number(paymentForm.months)
    if (!Number.isFinite(months) || months <= 0) {
      setFeedback({ type: 'error', message: 'Ingresa un número de periodos mayor a cero.' })
      return
    }

    recordPayment({
      clientId: paymentForm.clientId,
      months,
      method: paymentForm.method,
      note: paymentForm.note,
    })

    setFeedback({
      type: 'success',
      message: `Se registró el pago de ${months} ${months === 1 ? 'periodo' : 'periodos'} para ${activeClient?.name ?? 'el cliente'}.`,
    })
    setPaymentForm({ open: false, clientId: '', months: 1, method: 'Efectivo', note: '' })
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="resumen" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="resumen" className="text-lg font-semibold text-slate-900">
              Resumen del periodo
            </h2>
            <p className="text-sm text-slate-500">
              Controla las suscripciones activas, ingresos estimados y pendientes por cobrar.
            </p>
          </div>
          <Link
            to="/clients"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          >
            Administrar clientes →
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Clientes activos"
            value={metrics.totalClients}
            icon={Users}
            trend={`+${metrics.paidClients} al día`}
          />
          <StatCard
            title="Pendientes de pago"
            value={metrics.pendingClients}
            icon={DollarSign}
            trend={metrics.pendingClients > 0 ? `-${metrics.pendingClients} por cobrar` : 'Todo al día'}
            className={metrics.pendingClients > 0 ? 'ring-2 ring-amber-200' : ''}
          />
          <StatCard
            title="Ingresos estimados"
            value={peso(metrics.clientIncome + metrics.resellerIncome)}
            icon={Wifi}
            trend={`Gastos: ${peso(metrics.internetCosts + metrics.totalExpenses)}`}
          />
        </div>
      </section>

      <section aria-labelledby="clientes" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="clientes" className="text-lg font-semibold text-slate-900">
              Clientes por estado
            </h2>
            <p className="text-sm text-slate-500">Filtra y registra pagos sin perder el contexto.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((filter) => (
              <Button
                key={filter.value}
                variant={statusFilter === filter.value ? 'default' : 'ghost'}
                className={statusFilter === filter.value ? '' : 'border border-slate-200 bg-white text-slate-700 hover:border-blue-200'}
                onClick={() => setStatusFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 focus-within:ring-2 focus-within:ring-blue-500/40 sm:max-w-sm">
              <span className="sr-only">Buscar cliente o localidad</span>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar cliente o localidad"
                aria-label="Buscar cliente o localidad"
                className="w-full border-none bg-transparent text-sm text-slate-700 outline-none"
                type="search"
              />
            </label>
            <p className="text-sm text-slate-500" role="status">
              {filteredClients.length} cliente(s) coinciden con el filtro.
            </p>
          </div>

          {feedback && (
            <div
              role="alert"
              className={`rounded-md border px-3 py-2 text-sm ${
                feedback.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {feedback.message}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm" role="grid">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Nombre
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Localidad
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Estado
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.map((client) => (
                  <tr key={client.id}>
                    <td className="px-3 py-2 font-medium text-slate-900">{client.name}</td>
                    <td className="px-3 py-2 text-slate-600">{client.location}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          client.debtMonths > 0
                            ? 'bg-red-50 text-red-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {client.debtMonths > 0
                          ? `Debe ${client.debtMonths} ${client.debtMonths === 1 ? 'periodo' : 'periodos'}`
                          : 'Al día'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        onClick={() =>
                          setPaymentForm({
                            open: true,
                            clientId: client.id,
                            months: Math.max(1, client.debtMonths || 1),
                            method: 'Efectivo',
                            note: '',
                          })
                        }
                      >
                        Registrar pago
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">
                      No hay clientes que coincidan con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {paymentForm.open && activeClient && (
            <form className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4" onSubmit={handleSubmitPayment}>
              <h3 className="text-sm font-semibold text-slate-800">Registrar pago rápido</h3>
              <p className="text-xs text-slate-500">
                {activeClient.name} tiene {activeClient.debtMonths} periodo(s) pendientes y {activeClient.paidMonthsAhead} adelantados.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Periodos pagados
                  <input
                    min={1}
                    value={paymentForm.months}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, months: event.target.value }))
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    type="number"
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Método
                  <select
                    value={paymentForm.method}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, method: event.target.value }))
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    required
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Tarjeta">Tarjeta</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Nota (opcional)
                <textarea
                  value={paymentForm.note}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                  className="min-h-[60px] rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
                  onClick={() => setPaymentForm({ open: false, clientId: '', months: 1, method: 'Efectivo', note: '' })}
                >
                  Cancelar
                </Button>
                <Button type="submit">Confirmar pago</Button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
