import React, { useMemo } from 'react'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { INVENTORY_IP_RANGES, useBackofficeStore } from '../store/useBackofficeStore.js'

const STATUS_LABELS = {
  assigned: 'Asignado',
  available: 'Disponible',
  maintenance: 'Mantenimiento',
}

const STATUS_STYLES = {
  assigned: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  available: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  maintenance: 'bg-amber-50 text-amber-700 ring-amber-600/20',
}

const statusOrder = {
  assigned: 0,
  available: 1,
  maintenance: 2,
}

const formatBaseLabel = (baseKey, range) => range?.label ?? `Base ${baseKey}`

export default function InventoryPage() {
  const inventory = useBackofficeStore((state) => state.inventory)

  const baseSummaries = useMemo(() => {
    return Object.entries(INVENTORY_IP_RANGES).map(([baseKey, range]) => {
      const baseItems = inventory.filter((item) => Number(item.base) === Number(baseKey))
      const assignedIps = new Set()

      baseItems.forEach((item) => {
        const candidate = item.ip?.trim()
        if (candidate) {
          assignedIps.add(candidate)
        }
      })

      const totalIps = range.end - range.start + 1
      const availableIpsCount = Math.max(totalIps - assignedIps.size, 0)
      const nextAvailable = []

      for (let value = range.start; value <= range.end && nextAvailable.length < 5; value += 1) {
        const candidate = `${range.prefix}${value}`
        if (!assignedIps.has(candidate)) {
          nextAvailable.push(candidate)
        }
      }

      const statusCounts = baseItems.reduce((acc, item) => {
        const key = item.status ?? 'assigned'
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      }, {})

      return {
        baseKey,
        label: formatBaseLabel(baseKey, range),
        range,
        totalIps,
        assignedIpsCount: assignedIps.size,
        availableIpsCount,
        nextAvailable,
        statusCounts,
      }
    })
  }, [inventory])

  const totals = useMemo(() => {
    return inventory.reduce(
      (acc, item) => {
        const normalizedStatus = item.status ?? 'assigned'
        acc.total += 1
        acc.byStatus[normalizedStatus] = (acc.byStatus[normalizedStatus] ?? 0) + 1
        if (item.ip) acc.withIp += 1
        return acc
      },
      { total: 0, withIp: 0, byStatus: {} },
    )
  }, [inventory])

  const sortedInventory = useMemo(() => {
    return [...inventory].sort((a, b) => {
      const baseDiff = (Number(a.base) || 0) - (Number(b.base) || 0)
      if (baseDiff !== 0) return baseDiff

      const statusDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
      if (statusDiff !== 0) return statusDiff

      return (a.ip || '').localeCompare(b.ip || '')
    })
  }, [inventory])

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Inventario de equipos</h1>
        <p className="text-sm text-slate-500">
          Consulta las antenas y radios instalados, junto con el control de direcciones IP
          fijas por base.
        </p>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Resumen general:</span>
          <span>
            {totals.total} equipos registrados · {totals.withIp} con IP fija asignada
          </span>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <span key={key} className="flex items-center gap-1">
              <span
                className={`inline-flex h-2 w-2 rounded-full ${
                  key === 'assigned'
                    ? 'bg-blue-500'
                    : key === 'available'
                      ? 'bg-emerald-500'
                      : 'bg-amber-500'
                }`}
                aria-hidden
              />
              {label}: {totals.byStatus[key] ?? 0}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {baseSummaries.map((summary) => (
          <Card key={summary.baseKey} className="border border-slate-200">
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {summary.label}
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {summary.availableIpsCount} IPs disponibles
                  </p>
                  <p className="text-xs text-slate-500">
                    {summary.assignedIpsCount} en uso · {summary.totalIps} totales
                  </p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                  Rango {summary.range.prefix}{summary.range.start} - {summary.range.prefix}
                  {summary.range.end}
                </span>
              </div>
              {summary.nextAvailable.length > 0 ? (
                <p className="text-xs text-slate-500">
                  Siguientes IP libres: {summary.nextAvailable.join(', ')}
                </p>
              ) : (
                <p className="text-xs font-medium text-rose-600">
                  No quedan direcciones libres en este rango.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {Object.entries(summary.statusCounts).map(([status, count]) => (
                  <span
                    key={status}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                      STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {STATUS_LABELS[status] ?? status}: {count}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Listado de equipos</h2>
          <p className="text-sm text-slate-500">
            Cada registro muestra la IP fija asignada, la base a la que pertenece y el cliente o
            sitio donde está instalado.
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th
                  scope="col"
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Equipo
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  IP fija
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Base
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Cliente / sitio
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Estado
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Observaciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {sortedInventory.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-900">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-900">
                        {item.model || item.brand}
                      </span>
                      <span className="text-xs text-slate-500">
                        {item.brand}
                        {item.serial ? ` · Serie ${item.serial}` : ''}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                    {item.ip ?? <span className="text-xs text-slate-400">Sin asignar</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                    {formatBaseLabel(
                      item.base ?? '—',
                      INVENTORY_IP_RANGES[String(item.base ?? '')],
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                    <div className="flex flex-col">
                      <span className="text-slate-900">{item.client ?? 'Disponible'}</span>
                      <span className="text-xs text-slate-500">{item.location}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                        STATUS_STYLES[item.status] ?? 'bg-slate-100 text-slate-600 ring-slate-500/20'
                      }`}
                    >
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {item.notes ? item.notes : <span className="text-xs text-slate-400">Sin notas</span>}
                  </td>
                </tr>
              ))}
              {sortedInventory.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm font-medium text-slate-500"
                  >
                    No hay equipos registrados en el inventario.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
