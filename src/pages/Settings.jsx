import React, { useState } from 'react'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { useBackofficeStore } from '../store/useBackofficeStore.js'

export default function SettingsPage() {
  const { baseCosts, voucherPrices, updateBaseCosts, updateVoucherPrices } = useBackofficeStore((state) => ({
    baseCosts: state.baseCosts,
    voucherPrices: state.voucherPrices,
    updateBaseCosts: state.updateBaseCosts,
    updateVoucherPrices: state.updateVoucherPrices,
  }))

  const [baseForm, setBaseForm] = useState(baseCosts)
  const [voucherForm, setVoucherForm] = useState(voucherPrices)

  const handleSubmitBase = (event) => {
    event.preventDefault()
    updateBaseCosts({
      base1: Number(baseForm.base1) || 0,
      base2: Number(baseForm.base2) || 0,
    })
  }

  const handleSubmitVoucher = (event) => {
    event.preventDefault()
    updateVoucherPrices(
      Object.fromEntries(
        Object.entries(voucherForm).map(([key, value]) => [key, Number(value) || 0]),
      ),
    )
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="configuracion-costos" className="space-y-4">
        <div>
          <h2 id="configuracion-costos" className="text-lg font-semibold text-slate-900">
            Costos de operación
          </h2>
          <p className="text-sm text-slate-500">
            Actualiza los costos mensuales de cada base para ajustar el cálculo de ganancias.
          </p>
        </div>
        <Card>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmitBase}>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Base 1
                <input
                  type="number"
                  min={0}
                  value={baseForm.base1}
                  onChange={(event) => setBaseForm((prev) => ({ ...prev, base1: event.target.value }))}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Base 2
                <input
                  type="number"
                  min={0}
                  value={baseForm.base2}
                  onChange={(event) => setBaseForm((prev) => ({ ...prev, base2: event.target.value }))}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit">Guardar costos</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="configuracion-fichas" className="space-y-4">
        <div>
          <h2 id="configuracion-fichas" className="text-lg font-semibold text-slate-900">
            Precios de fichas
          </h2>
          <p className="text-sm text-slate-500">
            Ajusta los precios unitarios que se usan para calcular las liquidaciones de revendedores.
          </p>
        </div>
        <Card>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-3" onSubmit={handleSubmitVoucher}>
              {Object.entries(voucherForm).map(([key, value]) => (
                <label key={key} className="grid gap-1 text-xs font-medium text-slate-600">
                  {key.toUpperCase()}
                  <input
                    type="number"
                    min={0}
                    value={value}
                    onChange={(event) =>
                      setVoucherForm((prev) => ({ ...prev, [key]: event.target.value }))
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              ))}
              <div className="md:col-span-3 flex justify-end">
                <Button type="submit">Guardar precios</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
