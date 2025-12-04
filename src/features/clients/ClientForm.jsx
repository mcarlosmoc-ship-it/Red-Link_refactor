import React, { useState } from 'react'
import Button from '../../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import InfoTooltip from '../../components/ui/InfoTooltip.jsx'

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
    <Card data-testid="client-form">
      <CardHeader>
        <CardTitle>Agregar cliente</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium" htmlFor="name">
                Nombre completo
              </label>
              <input
                id="name"
                className="mt-1 w-full rounded border border-slate-200 p-2"
                required
                data-testid="client-name"
                value={formState.name}
                onChange={(event) => handleChange('name', event.target.value)}
                placeholder="Nombre del cliente"
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="type">
                Tipo de cliente
              </label>
              <select
                id="type"
                className="mt-1 w-full rounded border border-slate-200 p-2"
                value={formState.type}
                onChange={(event) => handleChange('type', event.target.value)}
              >
                <option value="residential">Residencial</option>
                <option value="token">Hotspot / token</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium" htmlFor="location">
                Ubicación
              </label>
              <input
                id="location"
                className="mt-1 w-full rounded border border-slate-200 p-2"
                data-testid="client-location"
                value={formState.location}
                onChange={(event) => handleChange('location', event.target.value)}
                placeholder="Colonia, calle o referencia"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium" htmlFor="zoneId">
                Zona
                <InfoTooltip text="Etiqueta opcional para agrupar clientes." />
              </label>
              <input
                id="zoneId"
                className="mt-1 w-full rounded border border-slate-200 p-2"
                data-testid="client-zone"
                value={formState.zoneId}
                onChange={(event) => handleChange('zoneId', event.target.value)}
                placeholder="ID de zona/base"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium" htmlFor="notes">
                Notas
              </label>
              <input
                id="notes"
                className="mt-1 w-full rounded border border-slate-200 p-2"
                value={formState.notes}
                onChange={(event) => handleChange('notes', event.target.value)}
                placeholder="Comentarios o datos relevantes"
              />
            </div>
            <div className="flex items-end justify-end">
              <span className="text-xs text-slate-500">
                Captura solo los datos básicos. Los servicios se asignan después del registro.
              </span>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting} data-testid="submit-client">
              Guardar cliente
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
