import React, { useMemo, useState } from 'react'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { peso, today } from '../utils/formatters.js'
import { useBackofficeStore } from '../store/useBackofficeStore.js'

const VOUCHER_TYPES = [
  { key: 'h1', label: '1 hora' },
  { key: 'h3', label: '3 horas' },
  { key: 'd1', label: '1 día' },
  { key: 'w1', label: '1 semana' },
  { key: 'd15', label: '15 días' },
  { key: 'm1', label: '1 mes' },
]

const createEmptyQty = () => VOUCHER_TYPES.reduce((acc, item) => ({ ...acc, [item.key]: 0 }), {})

export default function ResellersPage() {
  const { resellers, voucherPrices, addResellerDelivery, settleResellerDelivery } = useBackofficeStore((state) => ({
    resellers: state.resellers,
    voucherPrices: state.voucherPrices,
    addResellerDelivery: state.addResellerDelivery,
    settleResellerDelivery: state.settleResellerDelivery,
  }))

  const [selectedReseller, setSelectedReseller] = useState(resellers[0]?.id ?? '')
  const [deliveryForm, setDeliveryForm] = useState({ resellerId: resellers[0]?.id ?? '', qty: createEmptyQty() })
  const [settlementForm, setSettlementForm] = useState({
    resellerId: resellers[0]?.id ?? '',
    deliveryId: '',
    paidPercent: 15,
    received: '',
  })
  const [feedback, setFeedback] = useState(null)

  const currentReseller = useMemo(
    () => resellers.find((reseller) => reseller.id === selectedReseller) ?? null,
    [resellers, selectedReseller],
  )

  const pendingDeliveries = useMemo(() => {
    if (!settlementForm.resellerId) return []
    const reseller = resellers.find((item) => item.id === settlementForm.resellerId)
    return reseller ? reseller.deliveries.filter((delivery) => !delivery.settled) : []
  }, [resellers, settlementForm.resellerId])

  const computeDeliveryTotal = (qty) =>
    VOUCHER_TYPES.reduce(
      (total, item) => total + (Number(qty[item.key]) || 0) * (voucherPrices[item.key] ?? 0),
      0,
    )

  const handleDeliverySubmit = (event) => {
    event.preventDefault()
    const hasQty = VOUCHER_TYPES.some((item) => Number(deliveryForm.qty[item.key]) > 0)
    if (!deliveryForm.resellerId || !hasQty) {
      setFeedback({ type: 'error', message: 'Ingresa al menos una cantidad mayor a cero.' })
      return
    }

    addResellerDelivery({ resellerId: deliveryForm.resellerId, qty: deliveryForm.qty, date: today() })
    setFeedback({ type: 'success', message: 'Entrega registrada correctamente.' })
    setDeliveryForm({ resellerId: deliveryForm.resellerId, qty: createEmptyQty() })
  }

  const handleSettlementSubmit = (event) => {
    event.preventDefault()
    if (!settlementForm.resellerId || !settlementForm.deliveryId) {
      setFeedback({ type: 'error', message: 'Selecciona una entrega pendiente.' })
      return
    }
    settleResellerDelivery({
      resellerId: settlementForm.resellerId,
      deliveryId: settlementForm.deliveryId,
      paidPercent: Number(settlementForm.paidPercent) || 0,
      received: Number(settlementForm.received) || 0,
    })
    setFeedback({ type: 'success', message: 'Liquidación registrada correctamente.' })
    setSettlementForm((prev) => ({ ...prev, deliveryId: '', received: '' }))
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="resellers" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="resellers" className="text-lg font-semibold text-slate-900">
              Revendedores y entregas
            </h2>
            <p className="text-sm text-slate-500">
              Consulta el estado de cada entrega y registra nuevas remesas de fichas.
            </p>
          </div>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Revendedor
            <select
              value={selectedReseller}
              onChange={(event) => {
                setSelectedReseller(event.target.value)
                setDeliveryForm((prev) => ({ ...prev, resellerId: event.target.value }))
                setSettlementForm((prev) => ({ ...prev, resellerId: event.target.value, deliveryId: '' }))
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {resellers.map((reseller) => (
                <option key={reseller.id} value={reseller.id}>
                  {reseller.name}
                </option>
              ))}
            </select>
          </label>
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

        <Card>
          <CardContent className="space-y-4">
            {currentReseller ? (
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-slate-900">Entregas pendientes</h3>
                <p className="text-sm text-slate-500">
                  Registra la venta de fichas o liquida cuando recibas el pago correspondiente.
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Entrega
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Fecha
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Total estimado
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentReseller.deliveries.map((delivery) => {
                        const total = computeDeliveryTotal(delivery.qty)
                        return (
                          <tr key={delivery.id}>
                            <td className="px-3 py-2 font-medium text-slate-900">{delivery.id}</td>
                            <td className="px-3 py-2 text-slate-600">{delivery.date}</td>
                            <td className="px-3 py-2 text-slate-600">{peso(total)}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  delivery.settled
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {delivery.settled ? 'Liquidada' : 'Pendiente'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No hay revendedores registrados.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="registrar-entrega" className="space-y-4">
        <div>
          <h2 id="registrar-entrega" className="text-lg font-semibold text-slate-900">
            Registrar nueva entrega
          </h2>
          <p className="text-sm text-slate-500">
            Ingresa las fichas que entregaste al revendedor seleccionado.
          </p>
        </div>

        <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleDeliverySubmit}>
          <div className="grid gap-4 md:grid-cols-3">
            {VOUCHER_TYPES.map((voucher) => (
              <label key={voucher.key} className="grid gap-1 text-xs font-medium text-slate-600">
                {voucher.label}
                <input
                  type="number"
                  min={0}
                  value={deliveryForm.qty[voucher.key]}
                  onChange={(event) =>
                    setDeliveryForm((prev) => ({
                      ...prev,
                      qty: { ...prev.qty, [voucher.key]: event.target.value },
                    }))
                  }
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="submit">Guardar entrega</Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="liquidar" className="space-y-4">
        <div>
          <h2 id="liquidar" className="text-lg font-semibold text-slate-900">
            Registrar liquidación
          </h2>
          <p className="text-sm text-slate-500">
            Selecciona una entrega pendiente para calcular la ganancia y registrar el pago recibido.
          </p>
        </div>

        <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleSettlementSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Entrega pendiente
              <select
                value={settlementForm.deliveryId}
                onChange={(event) => setSettlementForm((prev) => ({ ...prev, deliveryId: event.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Selecciona una entrega</option>
                {pendingDeliveries.map((delivery) => (
                  <option key={delivery.id} value={delivery.id}>
                    {delivery.id} · {delivery.date}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Porcentaje para revendedor
              <input
                type="number"
                min={0}
                max={100}
                value={settlementForm.paidPercent}
                onChange={(event) => setSettlementForm((prev) => ({ ...prev, paidPercent: event.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Monto recibido
              <input
                type="number"
                min={0}
                value={settlementForm.received}
                onChange={(event) => setSettlementForm((prev) => ({ ...prev, received: event.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="submit">Registrar liquidación</Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="historial" className="space-y-4">
        <div>
          <h2 id="historial" className="text-lg font-semibold text-slate-900">
            Historial de liquidaciones
          </h2>
          <p className="text-sm text-slate-500">
            Revisa lo que se ha liquidado y las diferencias reportadas en cada entrega.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Revendedor
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Fecha
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Total
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Ganancia propia
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Diferencia
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resellers.flatMap((reseller) =>
                    reseller.settlements.map((settlement) => (
                      <tr key={settlement.id}>
                        <td className="px-3 py-2 text-slate-600">{reseller.name}</td>
                        <td className="px-3 py-2 text-slate-600">{settlement.date}</td>
                        <td className="px-3 py-2 text-slate-600">{peso(settlement.total)}</td>
                        <td className="px-3 py-2 text-slate-600">{peso(settlement.myGain)}</td>
                        <td className={`px-3 py-2 ${settlement.diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {peso(settlement.diff)}
                        </td>
                      </tr>
                    )),
                  )}
                  {resellers.every((reseller) => reseller.settlements.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                        Aún no hay liquidaciones registradas.
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
