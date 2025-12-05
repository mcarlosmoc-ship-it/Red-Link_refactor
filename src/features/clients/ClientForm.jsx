import React, { useState } from 'react'
import Button from '../../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import InfoTooltip from '../../components/ui/InfoTooltip.jsx'

function RequiredBadge() {
  return (
    <span className="text-rose-500" aria-hidden="true">
      *
    </span>
  )
}

const defaultForm = {
  type: 'residential',
  name: '',
  location: '',
  zoneId: '',
  notes: '',
  debtMonths: 0,
  paidMonthsAhead: 0,
}

export default function ClientForm({ onSubmit, isSubmitting }) {
  const [formState, setFormState] = useState(defaultForm)
  const [error, setError] = useState('')

  const handleChange = (key, value) => {
    setFormState((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const payload = {
        type: formState.type,
        name: formState.name.trim(),
        location: formState.location.trim(),
        zoneId: formState.zoneId ? Number(formState.zoneId) : null,
        paidMonthsAhead: 0,
        debtMonths: 0,
        notes: formState.notes?.trim() || '',
      }

      await onSubmit({ client: payload })
      setFormState(defaultForm)
    } catch (submitError) {
      setError(submitError?.message ?? 'No se pudo crear el cliente')
    }
  }

  return (
    <Card
      data-testid="client-form"
      className="relative overflow-hidden border border-slate-100 shadow-lg shadow-indigo-100"
    >
      <div className="pointer-events-none absolute -left-16 -top-10 h-48 w-48 rounded-full bg-gradient-to-br from-indigo-400/10 via-sky-400/10 to-emerald-300/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 -bottom-16 h-52 w-52 rounded-full bg-gradient-to-tl from-sky-500/10 via-indigo-400/10 to-fuchsia-400/10 blur-3xl" />
      <CardHeader className="relative border-b border-slate-100 bg-gradient-to-r from-white via-indigo-50/50 to-white">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">Wishub flow</p>
            <CardTitle className="text-xl text-slate-900">Agregar cliente</CardTitle>
            <p className="text-sm text-slate-600">
              Dale un ingreso suave y profesional a tus clientes con datos claros desde el inicio.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600 shadow-sm">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-indigo-400" aria-hidden />
            Campos marcados con <RequiredBadge /> son indispensables
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative bg-gradient-to-b from-white via-slate-50 to-white">
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-white/80 p-3 shadow-sm shadow-indigo-50">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-900" htmlFor="name">
                Nombre completo <RequiredBadge />
              </label>
              <input
                id="name"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white/90 p-2 text-slate-900 transition focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                required
                data-testid="client-name"
                value={formState.name}
                onChange={(event) => handleChange('name', event.target.value)}
                placeholder="Nombre del cliente"
              />
            </div>
            <div className="rounded-xl border border-slate-100 bg-white/80 p-3 shadow-sm shadow-indigo-50">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-900" htmlFor="type">
                Tipo de cliente <RequiredBadge />
              </label>
              <select
                id="type"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white/90 p-2 text-slate-900 transition focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                value={formState.type}
                required
                onChange={(event) => handleChange('type', event.target.value)}
              >
                <option value="residential">Residencial</option>
                <option value="token">Hotspot / token</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-white/80 p-3 shadow-sm shadow-indigo-50">
              <label className="text-sm font-semibold text-slate-900" htmlFor="location">
                Ubicación
              </label>
              <input
                id="location"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white/90 p-2 text-slate-900 transition focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                data-testid="client-location"
                value={formState.location}
                onChange={(event) => handleChange('location', event.target.value)}
                placeholder="Colonia, calle o referencia"
              />
            </div>
            <div className="rounded-xl border border-slate-100 bg-white/80 p-3 shadow-sm shadow-indigo-50">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-900" htmlFor="zoneId">
                Zona
                <InfoTooltip text="Etiqueta opcional para agrupar clientes." />
              </label>
              <input
                id="zoneId"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white/90 p-2 text-slate-900 transition focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                data-testid="client-zone"
                value={formState.zoneId}
                onChange={(event) => handleChange('zoneId', event.target.value)}
                placeholder="ID de zona/base"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-white/80 p-3 shadow-sm shadow-indigo-50">
              <label className="text-sm font-semibold text-slate-900" htmlFor="notes">
                Notas
              </label>
              <input
                id="notes"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white/90 p-2 text-slate-900 transition focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                value={formState.notes}
                onChange={(event) => handleChange('notes', event.target.value)}
                placeholder="Comentarios o datos relevantes"
              />
            </div>
            <div className="flex items-end justify-end">
              <span className="rounded-lg bg-white/70 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm shadow-indigo-50">
                Captura solo los datos básicos. Los servicios se asignan después del registro.
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-1 font-medium">
              <RequiredBadge />
              <span>Campo obligatorio antes de guardar</span>
            </div>
            <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 sm:inline-flex">
              Datos protegidos y listos para asignar servicios
            </span>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end">
            <Button
              type="submit"
              className="shadow-lg shadow-indigo-100 transition hover:scale-[1.01] hover:shadow-indigo-200"
              disabled={isSubmitting}
              data-testid="submit-client"
            >
              Guardar cliente
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
