import React, { useEffect, useMemo, useState } from 'react'
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
  const { resellers, voucherPrices, addResellerDelivery, settleResellerDelivery, createReseller } =
    useBackofficeStore((state) => ({
      resellers: state.resellers,
      voucherPrices: state.voucherPrices,
      addResellerDelivery: state.addResellerDelivery,
      settleResellerDelivery: state.settleResellerDelivery,
      createReseller: state.createReseller,
    }))

  const initialResellerId = resellers[0]?.id ?? ''
  const [selectedReseller, setSelectedReseller] = useState(initialResellerId)
  const [deliveryForm, setDeliveryForm] = useState({ resellerId: initialResellerId, qty: createEmptyQty() })
  const [settlementForm, setSettlementForm] = useState({
    resellerId: initialResellerId,
    deliveryId: '',
    paidPercent: 15,
    received: '',
    leftovers: createEmptyQty(),
  })
  const [resellerForm, setResellerForm] = useState({ name: '', location: '', base: '1' })
  const [isCreatingReseller, setIsCreatingReseller] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    if (resellers.length === 0) {
      if (selectedReseller !== '') {
        setSelectedReseller('')
      }
      setDeliveryForm((prev) => (prev.resellerId === '' ? prev : { ...prev, resellerId: '' }))
      setSettlementForm((prev) =>
        prev.resellerId === '' && prev.deliveryId === ''
          ? prev
          : { ...prev, resellerId: '', deliveryId: '', leftovers: createEmptyQty() },
      )
      return
    }

    const exists = resellers.some((reseller) => reseller.id === selectedReseller)
    if (!exists) {
      const nextId = resellers[0].id
      setSelectedReseller(nextId)
      setDeliveryForm((prev) => ({ ...prev, resellerId: nextId }))
      setSettlementForm((prev) => ({ ...prev, resellerId: nextId, deliveryId: '', leftovers: createEmptyQty() }))
    }
  }, [resellers, selectedReseller])

  const currentReseller = useMemo(
    () => resellers.find((reseller) => reseller.id === selectedReseller) ?? null,
    [resellers, selectedReseller],
  )

  const pendingDeliveries = useMemo(() => {
    if (!settlementForm.resellerId) return []
    const reseller = resellers.find((item) => item.id === settlementForm.resellerId)
    return reseller ? reseller.deliveries.filter((delivery) => !delivery.settled) : []
  }, [resellers, settlementForm.resellerId])

  const selectedDelivery = useMemo(() => {
    if (!settlementForm.deliveryId) return null
    return pendingDeliveries.find((delivery) => delivery.id === settlementForm.deliveryId) ?? null
  }, [pendingDeliveries, settlementForm.deliveryId])

  const settlementDetails = useMemo(() => {
    if (!selectedDelivery) return null

    const rows = VOUCHER_TYPES.map((voucher) => {
      const delivered = Number(selectedDelivery.qty?.[voucher.key]) || 0
      const rawLeftover = Number(settlementForm.leftovers[voucher.key]) || 0
      const safeLeftover = Math.min(Math.max(rawLeftover, 0), delivered)
      const sold = delivered - safeLeftover
      const unitPrice = voucherPrices[voucher.key] ?? 0
      const expected = sold * unitPrice

      return {
        ...voucher,
        delivered,
        leftover: safeLeftover,
        sold,
        unitPrice,
        expected,
      }
    })

    const expectedTotal = rows.reduce((total, item) => total + item.expected, 0)
    const totalSold = rows.reduce((total, item) => total + item.sold, 0)
    const paidPercent = Number(settlementForm.paidPercent) || 0
    const resellerShare = Math.round((expectedTotal * paidPercent) / 100)
    const myGain = expectedTotal - resellerShare
    const receivedAmount = Number(settlementForm.received) || 0
    const diff = receivedAmount - expectedTotal

    return {
      rows,
      expectedTotal,
      totalSold,
      resellerShare,
      myGain,
      receivedAmount,
      diff,
      paidPercent,
    }
  }, [selectedDelivery, settlementForm.leftovers, settlementForm.paidPercent, settlementForm.received, voucherPrices])

  const computeDeliveryTotal = (qty) =>
    VOUCHER_TYPES.reduce(
      (total, item) => total + (Number(qty[item.key]) || 0) * (voucherPrices[item.key] ?? 0),
      0,
    )

  const handleResellerSubmit = async (event) => {
    event.preventDefault()
    const name = resellerForm.name.trim()
    const location = resellerForm.location.trim()

    if (!name || !location) {
      setFeedback({ type: 'error', message: 'Ingresa el nombre y la ubicación del revendedor.' })
      return
    }

    setIsCreatingReseller(true)
    try {
      await createReseller({ name, base: resellerForm.base, location })
      setFeedback({ type: 'success', message: 'Revendedor agregado correctamente.' })
      setResellerForm((prev) => ({ ...prev, name: '', location: '' }))
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error?.message ?? 'No se pudo registrar el revendedor. Intenta nuevamente.',
      })
    } finally {
      setIsCreatingReseller(false)
    }
  }

  const handleDeliverySubmit = async (event) => {
    event.preventDefault()
    const hasQty = VOUCHER_TYPES.some((item) => Number(deliveryForm.qty[item.key]) > 0)
    if (!deliveryForm.resellerId || !hasQty) {
      setFeedback({ type: 'error', message: 'Ingresa al menos una cantidad mayor a cero.' })
      return
    }

    try {
      await addResellerDelivery({ resellerId: deliveryForm.resellerId, qty: deliveryForm.qty, date: today() })
      setFeedback({ type: 'success', message: 'Entrega registrada correctamente.' })
      setDeliveryForm({ resellerId: deliveryForm.resellerId, qty: createEmptyQty() })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error?.message ?? 'No se pudo registrar la entrega. Intenta nuevamente.',
      })
    }
  }

  const handleSettlementSubmit = async (event) => {
    event.preventDefault()
    if (!settlementForm.resellerId || !settlementForm.deliveryId) {
      setFeedback({ type: 'error', message: 'Selecciona una entrega pendiente.' })
      return
    }
    if (!selectedDelivery) {
      setFeedback({ type: 'error', message: 'No se encontró la entrega seleccionada.' })
      return
    }

    const hasInvalidLeftovers = VOUCHER_TYPES.some((voucher) => {
      const delivered = selectedDelivery.qty?.[voucher.key] ?? 0
      const leftover = Number(settlementForm.leftovers[voucher.key]) || 0
      return leftover > delivered
    })

    if (hasInvalidLeftovers) {
      setFeedback({
        type: 'error',
        message: 'Las fichas sobrantes no pueden ser mayores a las entregadas.',
      })
      return
    }

    try {
      await settleResellerDelivery({
        resellerId: settlementForm.resellerId,
        deliveryId: settlementForm.deliveryId,
        amount: settlementDetails?.expectedTotal ?? 0,
        notes: `Liquidación ${Number(settlementForm.paidPercent) || 0}%`,
      })
      setFeedback({ type: 'success', message: 'Liquidación registrada correctamente.' })
      setSettlementForm((prev) => ({
        ...prev,
        deliveryId: '',
        received: '',
        leftovers: createEmptyQty(),
      }))
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error?.message ?? 'No se pudo registrar la liquidación. Intenta nuevamente.',
      })
    }
  }

  const settlementDiffClass = settlementDetails
    ? settlementDetails.diff === 0
      ? 'text-slate-600'
      : settlementDetails.diff > 0
        ? 'text-emerald-600'
        : 'text-red-600'
    : 'text-slate-600'

  return (
    <div className="space-y-8">
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

      <section aria-labelledby="registrar-revendedor" className="space-y-4">
        <div>
          <h2 id="registrar-revendedor" className="text-lg font-semibold text-slate-900">
            Registrar revendedor
          </h2>
          <p className="text-sm text-slate-500">
            Agrega nuevos revendedores para habilitar entregas y liquidaciones desde el panel.
          </p>
        </div>

        <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleResellerSubmit}>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Nombre completo
              <input
                value={resellerForm.name}
                onChange={(event) => setResellerForm((prev) => ({ ...prev, name: event.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Juan Pérez"
                autoComplete="off"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Ubicación
              <input
                value={resellerForm.location}
                onChange={(event) => setResellerForm((prev) => ({ ...prev, location: event.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Colonia Centro"
                autoComplete="off"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Base asignada
              <select
                value={resellerForm.base}
                onChange={(event) => setResellerForm((prev) => ({ ...prev, base: event.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="1">Base 1</option>
                <option value="2">Base 2</option>
              </select>
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isCreatingReseller}>
              {isCreatingReseller ? 'Guardando…' : 'Guardar revendedor'}
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="registrar-entrega" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="registrar-entrega" className="text-lg font-semibold text-slate-900">
              Registrar nueva entrega
            </h2>
            <p className="text-sm text-slate-500">
              Ingresa las fichas que entregaste al revendedor seleccionado.
            </p>
          </div>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Revendedor
            <select
              value={selectedReseller}
              onChange={(event) => {
                const value = event.target.value
                setSelectedReseller(value)
                setDeliveryForm((prev) => ({ ...prev, resellerId: value }))
                setSettlementForm((prev) => ({
                  ...prev,
                  resellerId: value,
                  deliveryId: '',
                  leftovers: createEmptyQty(),
                }))
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {resellers.length === 0 && <option value="">Sin revendedores disponibles</option>}
              {resellers.map((reseller) => (
                <option key={reseller.id} value={reseller.id}>
                  {reseller.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleDeliverySubmit}>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Registrando fichas para{' '}
            <span className="font-semibold text-slate-900">
              {currentReseller?.name ?? 'Selecciona un revendedor'}
            </span>
          </div>
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
            <Button type="submit" disabled={!deliveryForm.resellerId}>
              Guardar entrega
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="resellers" className="space-y-4">
        <div>
          <h2 id="resellers" className="text-lg font-semibold text-slate-900">
            Revendedores y entregas
          </h2>
          <p className="text-sm text-slate-500">
            Consulta el estado de cada entrega y lleva el seguimiento de las pendientes y liquidadas.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4">
            {currentReseller ? (
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-slate-900">
                  Entregas registradas para {currentReseller.name}
                </h3>
                <p className="text-sm text-slate-500">
                  Revisa las entregas realizadas y su estado actual.
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

      <section aria-labelledby="liquidar" className="space-y-4">
        <div>
          <h2 id="liquidar" className="text-lg font-semibold text-slate-900">
            Registrar liquidación
          </h2>
          <p className="text-sm text-slate-500">
            Cuenta las fichas sobrantes para calcular cuántas se vendieron y registra el pago recibido.
          </p>
        </div>

        <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleSettlementSubmit}>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Liquidando entrega de{' '}
            <span className="font-semibold text-slate-900">
              {currentReseller?.name ?? 'Selecciona un revendedor'}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Entrega pendiente
              <select
                value={settlementForm.deliveryId}
                onChange={(event) =>
                  setSettlementForm((prev) => ({
                    ...prev,
                    deliveryId: event.target.value,
                    leftovers: createEmptyQty(),
                  }))
                }
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

          {selectedDelivery && settlementDetails ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Ficha
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Entregadas
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Sobrantes
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Vendidas
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Precio
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Esperado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {settlementDetails.rows.map((row) => (
                      <tr key={row.key}>
                        <td className="px-3 py-2 text-slate-600">{row.label}</td>
                        <td className="px-3 py-2 text-slate-600">{row.delivered}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={row.delivered}
                            value={settlementForm.leftovers[row.key]}
                            onChange={(event) =>
                              setSettlementForm((prev) => ({
                                ...prev,
                                leftovers: { ...prev.leftovers, [row.key]: event.target.value },
                              }))
                            }
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            aria-label={`Fichas sobrantes de ${row.label}`}
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-600">{row.sold}</td>
                        <td className="px-3 py-2 text-slate-600">{peso(row.unitPrice)}</td>
                        <td className="px-3 py-2 text-slate-600">{peso(row.expected)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50">
                      <th scope="row" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Totales
                      </th>
                      <td className="px-3 py-2 text-slate-600">
                        {settlementDetails.rows.reduce((total, row) => total + row.delivered, 0)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {settlementDetails.rows.reduce((total, row) => total + row.leftover, 0)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{settlementDetails.totalSold}</td>
                      <td className="px-3 py-2 text-slate-600">—</td>
                      <td className="px-3 py-2 text-slate-600">{peso(settlementDetails.expectedTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Fichas vendidas:</span> {settlementDetails.totalSold}
                </p>
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Total esperado en caja:</span>{' '}
                  {peso(settlementDetails.expectedTotal)}
                </p>
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-slate-900">
                    Pago al revendedor ({settlementDetails.paidPercent}%):
                  </span>{' '}
                  {peso(settlementDetails.resellerShare)}
                </p>
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Ganancia propia estimada:</span>{' '}
                  {peso(settlementDetails.myGain)}
                </p>
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Dinero recibido:</span>{' '}
                  {peso(settlementDetails.receivedAmount)}
                </p>
                <p className={`text-sm font-medium ${settlementDiffClass}`}>
                  Diferencia vs esperado: {peso(settlementDetails.diff)}
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Selecciona una entrega pendiente para calcular la liquidación.
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={!selectedDelivery}>
              Registrar liquidación
            </Button>
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
                      Fichas vendidas
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Esperado
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Recibido
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
                        <td className="px-3 py-2 text-slate-600">{settlement.totalSold ?? 0}</td>
                        <td className="px-3 py-2 text-slate-600">{peso(settlement.total)}</td>
                        <td className="px-3 py-2 text-slate-600">{peso(settlement.received ?? 0)}</td>
                        <td className="px-3 py-2 text-slate-600">{peso(settlement.myGain)}</td>
                        <td className={`px-3 py-2 ${settlement.diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {peso(settlement.diff)}
                        </td>
                      </tr>
                    )),
                  )}
                  {resellers.every((reseller) => reseller.settlements.length === 0) && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
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
