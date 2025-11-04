import React, { useEffect, useMemo, useState } from 'react'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { INVENTORY_IP_RANGES, useBackofficeStore } from '../store/useBackofficeStore.js'
import { useClients } from '../hooks/useClients.js'
import { useToast } from '../hooks/useToast.js'
import {
  CLIENT_IP_RANGES,
  createAssignedIpIndex,
  getAvailableIpsByRange,
} from '../utils/clientIpConfig.js'

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

const defaultEquipmentForm = {
  brand: '',
  model: '',
  serial: '',
  assetTag: '',
  base: '1',
  ip: '',
  status: 'assigned',
  location: '',
  client: '',
  notes: '',
  installedAt: '',
}

export default function InventoryPage() {
  const {
    inventory,
    inventoryStatus,
    loadInventory,
    addInventoryItem,
  } = useBackofficeStore((state) => ({
    inventory: state.inventory,
    inventoryStatus: state.status.inventory,
    loadInventory: state.loadInventory,
    addInventoryItem: state.addInventoryItem,
  }))
  const { clients, status: clientsStatus, toggleClientService, reload: reloadClients } = useClients()
  const { showToast } = useToast()
  const [equipmentForm, setEquipmentForm] = useState({ ...defaultEquipmentForm })
  const [equipmentErrors, setEquipmentErrors] = useState({})
  const [isRetryingInventory, setIsRetryingInventory] = useState(false)
  const [tokenSearchTerm, setTokenSearchTerm] = useState('')
  const [isRetryingClients, setIsRetryingClients] = useState(false)

  useEffect(() => {
    if (inventoryStatus?.isLoading || inventoryStatus?.isMutating) {
      return
    }
    if (inventoryStatus?.lastFetchedAt) {
      return
    }

    loadInventory({ force: true }).catch(() => {})
  }, [inventoryStatus?.isLoading, inventoryStatus?.isMutating, inventoryStatus?.lastFetchedAt, loadInventory])

  const normalizedTokenSearch = tokenSearchTerm.trim().toLowerCase()
  const tokenClients = useMemo(
    () => clients.filter((client) => client.type === 'token'),
    [clients],
  )
  const assignedTokenIps = useMemo(
    () => createAssignedIpIndex(tokenClients),
    [tokenClients],
  )
  const availableTokenIps = useMemo(
    () => getAvailableIpsByRange(assignedTokenIps),
    [assignedTokenIps],
  )

  const tokenInventoryByBase = useMemo(() => {
    const countsByBase = tokenClients.reduce((acc, client) => {
      const baseKey = String(client.base ?? 1)
      acc[baseKey] = (acc[baseKey] ?? 0) + 1
      return acc
    }, {})

    return Object.keys(CLIENT_IP_RANGES.tokenAntenna).map((baseKey) => {
      const antennaSet = assignedTokenIps.tokenAntenna?.[baseKey]
      const modemSet = assignedTokenIps.tokenModem?.[baseKey]
      const antennaAvailable = availableTokenIps.tokenAntenna?.[baseKey] ?? []
      const modemAvailable = availableTokenIps.tokenModem?.[baseKey] ?? []

      return {
        base: Number(baseKey),
        antennasInstalled: countsByBase[baseKey] ?? 0,
        antennaIpsInUse: antennaSet ? antennaSet.size : 0,
        antennaIpsAvailable: antennaAvailable.length,
        nextAntennaIp: antennaAvailable[0] ?? null,
        modemIpsInUse: modemSet ? modemSet.size : 0,
        modemIpsAvailable: modemAvailable.length,
        nextModemIp: modemAvailable[0] ?? null,
      }
    })
  }, [tokenClients, assignedTokenIps, availableTokenIps])

  const filteredTokenClients = useMemo(() => {
    const sorted = [...tokenClients].sort((a, b) => {
      const baseDiff = (Number(a.base) || 0) - (Number(b.base) || 0)
      if (baseDiff !== 0) return baseDiff
      return a.name.localeCompare(b.name)
    })

    if (!normalizedTokenSearch) {
      return sorted
    }

    return sorted.filter((client) => {
      const values = [
        client.name,
        client.location,
        client.antennaModel,
        client.modemModel,
        client.antennaIp,
        client.modemIp,
      ]

      return values.some((value) => {
        if (!value) return false
        return value.toString().toLowerCase().includes(normalizedTokenSearch)
      })
    })
  }, [tokenClients, normalizedTokenSearch])

  const filteredTokenClientsCountLabel = useMemo(() => {
    const count = filteredTokenClients.length
    const noun = count === 1 ? 'registro' : 'registros'
    return `${count} ${noun}`
  }, [filteredTokenClients.length])

  const clientOptions = useMemo(
    () =>
      [...clients]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((client) => ({
          value: client.id,
          label: `${client.name} · ${client.location} · Base ${client.base}`,
        })),
    [clients],
  )

  const isMutatingInventory = Boolean(inventoryStatus?.isMutating)
  const isLoadingInventory = Boolean(inventoryStatus?.isLoading && inventory.length === 0)
  const isSyncingInventory = Boolean(inventoryStatus?.isLoading && inventory.length > 0)
  const hasInventoryError = Boolean(inventoryStatus?.error)

  const isLoadingTokenClients = Boolean(clientsStatus?.isLoading && tokenClients.length === 0)
  const isSyncingTokenClients = Boolean(clientsStatus?.isLoading && tokenClients.length > 0)
  const isMutatingClients = Boolean(clientsStatus?.isMutating)
  const hasTokenClientsError = Boolean(clientsStatus?.error)

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

  const validateEquipmentForm = () => {
    const errors = {}

    if (!equipmentForm.brand.trim()) {
      errors.brand = 'Ingresa la marca del equipo.'
    }
    if (!equipmentForm.model.trim()) {
      errors.model = 'Ingresa el modelo del equipo.'
    }
    if (!equipmentForm.base) {
      errors.base = 'Selecciona la base del equipo.'
    }
    if (!equipmentForm.status) {
      errors.status = 'Selecciona el estado del equipo.'
    }

    const ipValue = equipmentForm.ip.trim()
    if (ipValue) {
      const range = INVENTORY_IP_RANGES[equipmentForm.base]
      if (range) {
        if (!ipValue.startsWith(range.prefix)) {
          errors.ip = `La IP debe iniciar con ${range.prefix}`
        } else {
          const suffix = Number(ipValue.split('.').pop())
          const isValidSuffix = Number.isInteger(suffix) && suffix >= range.start && suffix <= range.end
          if (!isValidSuffix) {
            errors.ip = `La IP debe estar entre ${range.prefix}${range.start} y ${range.prefix}${range.end}.`
          }
        }
      }
    }

    setEquipmentErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleEquipmentSubmit = async (event) => {
    event.preventDefault()
    if (!validateEquipmentForm()) {
      return
    }

    const payload = {
      brand: equipmentForm.brand.trim(),
      model: equipmentForm.model.trim(),
      serial: equipmentForm.serial.trim(),
      assetTag: equipmentForm.assetTag.trim(),
      base: Number(equipmentForm.base) || 1,
      ip: equipmentForm.ip.trim(),
      status: equipmentForm.status,
      location: equipmentForm.location.trim(),
      client: equipmentForm.client ? Number(equipmentForm.client) : null,
      notes: equipmentForm.notes.trim(),
      installedAt: equipmentForm.installedAt || null,
    }

    try {
      await addInventoryItem(payload)
      showToast({
        type: 'success',
        title: 'Equipo registrado',
        description: 'El inventario se actualizó correctamente.',
      })
      setEquipmentForm({ ...defaultEquipmentForm })
      setEquipmentErrors({})
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo registrar el equipo',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    }
  }

  const handleReloadInventory = async () => {
    setIsRetryingInventory(true)
    try {
      await loadInventory({ force: true })
      showToast({
        type: 'success',
        title: 'Inventario sincronizado',
        description: 'El listado se actualizó correctamente.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo cargar el inventario',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    } finally {
      setIsRetryingInventory(false)
    }
  }

  const handleReloadTokenClients = async () => {
    setIsRetryingClients(true)
    try {
      await reloadClients()
      showToast({
        type: 'success',
        title: 'Clientes sincronizados',
        description: 'Las antenas públicas se actualizaron correctamente.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudieron cargar las antenas públicas',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    } finally {
      setIsRetryingClients(false)
    }
  }

  const handleToggleService = async (client) => {
    try {
      const nextStatus = await toggleClientService(client.id)
      showToast({
        type: 'success',
        title: nextStatus === 'Activo' ? 'Servicio activado' : 'Servicio suspendido',
        description: `${client.name} ahora está ${nextStatus.toLowerCase()}.`,
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo actualizar el servicio',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    }
  }

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

      {isLoadingInventory && (
        <div
          role="status"
          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700"
        >
          Cargando inventario…
        </div>
      )}
      {!isLoadingInventory && isSyncingInventory && (
        <div
          role="status"
          className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-600"
        >
          Sincronizando cambios recientes…
        </div>
      )}
      {hasInventoryError && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          <span>No se pudo cargar el inventario. Intenta nuevamente.</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="border border-red-200 bg-white text-red-700 hover:border-red-300"
            onClick={handleReloadInventory}
            disabled={isRetryingInventory}
          >
            {isRetryingInventory ? 'Reintentando…' : 'Reintentar'}
          </Button>
        </div>
      )}

      <section aria-labelledby="nuevo-equipo" className="space-y-4">
        <div>
          <h2 id="nuevo-equipo" className="text-lg font-semibold text-slate-900">
            Registrar nuevo equipo
          </h2>
          <p className="text-sm text-slate-500">
            Guarda radios, antenas u otros dispositivos para mantener actualizado tu inventario.
          </p>
        </div>

        <form
          className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={handleEquipmentSubmit}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Marca
              <input
                value={equipmentForm.brand}
                onChange={(event) =>
                  setEquipmentForm((prev) => ({ ...prev, brand: event.target.value }))
                }
                className={`rounded-md border px-3 py-2 text-sm ${
                  equipmentErrors.brand
                    ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                    : 'border-slate-300'
                }`}
                placeholder="Ubiquiti"
                autoComplete="off"
              />
              {equipmentErrors.brand && (
                <span className="text-xs font-medium text-red-600">{equipmentErrors.brand}</span>
              )}
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Modelo
              <input
                value={equipmentForm.model}
                onChange={(event) =>
                  setEquipmentForm((prev) => ({ ...prev, model: event.target.value }))
                }
                className={`rounded-md border px-3 py-2 text-sm ${
                  equipmentErrors.model
                    ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                    : 'border-slate-300'
                }`}
                placeholder="LiteBeam AC Gen2"
                autoComplete="off"
              />
              {equipmentErrors.model && (
                <span className="text-xs font-medium text-red-600">{equipmentErrors.model}</span>
              )}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Número de serie (opcional)
              <input
                value={equipmentForm.serial}
                onChange={(event) =>
                  setEquipmentForm((prev) => ({ ...prev, serial: event.target.value }))
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="SN123456789"
                autoComplete="off"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Etiqueta / activo (opcional)
              <input
                value={equipmentForm.assetTag}
                onChange={(event) =>
                  setEquipmentForm((prev) => ({ ...prev, assetTag: event.target.value }))
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="ACT-001"
                autoComplete="off"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Estado
              <select
                value={equipmentForm.status}
                onChange={(event) =>
                  setEquipmentForm((prev) => ({ ...prev, status: event.target.value }))
                }
                className={`rounded-md border px-3 py-2 text-sm ${
                  equipmentErrors.status
                    ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                    : 'border-slate-300'
                }`}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {equipmentErrors.status && (
                <span className="text-xs font-medium text-red-600">{equipmentErrors.status}</span>
              )}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Base
              <select
                value={equipmentForm.base}
                onChange={(event) =>
                  setEquipmentForm((prev) => ({ ...prev, base: event.target.value }))
                }
                className={`rounded-md border px-3 py-2 text-sm ${
                  equipmentErrors.base
                    ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                    : 'border-slate-300'
                }`}
              >
                {Object.entries(INVENTORY_IP_RANGES).map(([baseKey, range]) => (
                  <option key={baseKey} value={baseKey}>
                    {formatBaseLabel(baseKey, range)}
                  </option>
                ))}
              </select>
              {equipmentErrors.base && (
                <span className="text-xs font-medium text-red-600">{equipmentErrors.base}</span>
              )}
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              IP fija (opcional)
              <input
                value={equipmentForm.ip}
                onChange={(event) =>
                  setEquipmentForm((prev) => ({ ...prev, ip: event.target.value }))
                }
                className={`rounded-md border px-3 py-2 text-sm ${
                  equipmentErrors.ip
                    ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                    : 'border-slate-300'
                }`}
                placeholder="192.168.4.10"
                autoComplete="off"
              />
              {equipmentErrors.ip && (
                <span className="text-xs font-medium text-red-600">{equipmentErrors.ip}</span>
              )}
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Ubicación / sitio
              <input
                value={equipmentForm.location}
                onChange={(event) =>
                  setEquipmentForm((prev) => ({ ...prev, location: event.target.value }))
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Torre Base 1"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Asignar a cliente (opcional)
              <select
                value={equipmentForm.client}
                onChange={(event) =>
                  setEquipmentForm((prev) => ({ ...prev, client: event.target.value }))
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Sin asignar</option>
                {clientOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Fecha de instalación (opcional)
              <input
                value={equipmentForm.installedAt}
                onChange={(event) =>
                  setEquipmentForm((prev) => ({ ...prev, installedAt: event.target.value }))
                }
                type="date"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Notas (opcional)
            <textarea
              value={equipmentForm.notes}
              onChange={(event) =>
                setEquipmentForm((prev) => ({ ...prev, notes: event.target.value }))
              }
              className="min-h-[80px] rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Observaciones, mantenimiento pendiente, etc."
            />
          </label>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
              onClick={() => {
                setEquipmentForm({ ...defaultEquipmentForm })
                setEquipmentErrors({})
              }}
              disabled={isMutatingInventory}
            >
              Limpiar
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500/40"
              disabled={isMutatingInventory}
            >
              Guardar equipo
            </Button>
          </div>
        </form>
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

      <section aria-label="Antenas públicas" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Antenas públicas instaladas</h2>
            <p className="text-sm text-slate-500">
              Revisa los puntos activos, las IP asignadas y el estado del servicio.
            </p>
          </div>
          <span className="text-xs text-slate-500" role="status">
            {filteredTokenClientsCountLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex w-full items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 focus-within:ring-2 focus-within:ring-blue-500/40 md:max-w-sm">
            <span className="sr-only">Buscar antena pública</span>
            <input
              value={tokenSearchTerm}
              onChange={(event) => setTokenSearchTerm(event.target.value)}
              type="search"
              placeholder="Buscar por nombre, localidad o IP"
              className="w-full border-none bg-transparent outline-none"
            />
          </label>
          {tokenSearchTerm && (
            <Button
              type="button"
              variant="ghost"
              className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
              onClick={() => setTokenSearchTerm('')}
            >
              Limpiar
            </Button>
          )}
        </div>

        {isLoadingTokenClients && (
          <div
            role="status"
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700"
          >
            Cargando antenas públicas…
          </div>
        )}
        {!isLoadingTokenClients && isSyncingTokenClients && (
          <div
            role="status"
            className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-600"
          >
            Actualizando información reciente…
          </div>
        )}
        {hasTokenClientsError && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            <span>No se pudieron cargar las antenas públicas. Intenta nuevamente.</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="border border-red-200 bg-white text-red-700 hover:border-red-300"
              onClick={handleReloadTokenClients}
              disabled={isRetryingClients}
            >
              {isRetryingClients ? 'Reintentando…' : 'Reintentar'}
            </Button>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {tokenInventoryByBase.map((info) => (
            <div
              key={info.base}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600"
            >
              <h3 className="text-sm font-semibold text-slate-700">Base {info.base}</h3>
              <dl className="mt-2 space-y-1">
                <div className="flex justify-between gap-2">
                  <dt className="font-medium">Antenas instaladas</dt>
                  <dd>{info.antennasInstalled}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>IPs de antena en uso</dt>
                  <dd>{info.antennaIpsInUse}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>IPs de antena disponibles</dt>
                  <dd>{info.antennaIpsAvailable}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Próxima IP de antena</dt>
                  <dd>{info.nextAntennaIp ?? 'N/A'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>IPs de módem en uso</dt>
                  <dd>{info.modemIpsInUse}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>IPs de módem disponibles</dt>
                  <dd>{info.modemIpsAvailable}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Próxima IP de módem</dt>
                  <dd>{info.nextModemIp ?? 'N/A'}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Punto
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Localidad
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Base
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Antena
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Módem
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Servicio
                </th>
                <th scope="col" className="px-3 py-2 font-medium text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTokenClients.map((client) => (
                <tr key={client.id}>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <div className="flex flex-col">
                      <span>{client.name}</span>
                      {client.antennaIp && (
                        <span className="text-xs text-slate-500">IP antena: {client.antennaIp}</span>
                      )}
                      {client.modemIp && (
                        <span className="text-xs text-slate-500">IP módem: {client.modemIp}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{client.location}</td>
                  <td className="px-3 py-2 text-slate-600">Base {client.base}</td>
                  <td className="px-3 py-2 text-slate-600">
                    <div className="flex flex-col text-xs text-slate-500">
                      <span>Modelo: {client.antennaModel || 'Sin dato'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    <div className="flex flex-col text-xs text-slate-500">
                      <span>Modelo: {client.modemModel || 'Sin dato'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        client.service === 'Activo'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {client.service}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => handleToggleService(client)}
                      disabled={isMutatingClients}
                    >
                      {client.service === 'Activo' ? 'Suspender' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredTokenClients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                    No se encontraron antenas públicas con los filtros actuales.
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
