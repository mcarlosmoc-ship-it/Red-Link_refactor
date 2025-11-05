import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import ImportClientsModal from '../components/clients/ImportClientsModal.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { CLIENT_PRICE, useBackofficeStore } from '../store/useBackofficeStore.js'
import { useClients } from '../hooks/useClients.js'
import { useToast } from '../hooks/useToast.js'
import { peso } from '../utils/formatters.js'
import {
  CLIENT_ANTENNA_MODELS,
  CLIENT_IP_FIELDS_BY_TYPE,
  CLIENT_IP_RANGES,
  createAssignedIpIndex,
  getAvailableIpsByRange,
} from '../utils/clientIpConfig.js'
import { useBackofficeRefresh } from '../contexts/BackofficeRefreshContext.jsx'
import ClientsSkeleton from './ClientsSkeleton.jsx'

const periodsFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })

const formatPeriods = (value) => {
  const numericValue = Number(value) || 0
  return periodsFormatter.format(numericValue)
}

const isApproximatelyOne = (value) => Math.abs(Number(value) - 1) < 0.01

const LOCATIONS = ['Nuevo Amatenango', 'Zapotal', 'Naranjal', 'Belén', 'Lagunita']

const CLIENT_TYPE_LABELS = {
  residential: 'Cliente residencial',
  token: 'Punto con antena pública',
}

const defaultForm = {
  type: 'residential',
  name: '',
  location: LOCATIONS[0],
  base: 1,
  ip: '',
  antennaIp: '',
  modemIp: '',
  antennaModel: CLIENT_ANTENNA_MODELS[0],
  modemModel: '',
  debtMonths: 0,
  paidMonthsAhead: 0,
  monthlyFee: CLIENT_PRICE,
}

export default function ClientsPage() {
  const initializeStatus = useBackofficeStore((state) => state.status.initialize)
  const { isRefreshing } = useBackofficeRefresh()
  const {
    clients,
    status: clientsStatus,
    reload: reloadClients,
    createClient,
    toggleClientService,
    importClients,
  } = useClients()
  const { showToast } = useToast()
  const location = useLocation()
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [formState, setFormState] = useState({ ...defaultForm })
  const [formErrors, setFormErrors] = useState({})
  const [isRetrying, setIsRetrying] = useState(false)
  const [highlightedClientId, setHighlightedClientId] = useState(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [isImportingClients, setIsImportingClients] = useState(false)
  const isMutatingClients = Boolean(clientsStatus?.isMutating)
  const isSyncingClients = Boolean(clientsStatus?.isLoading)
  const isLoadingClients = Boolean(clientsStatus?.isLoading && clients.length === 0)
  const hasClientsError = Boolean(clientsStatus?.error)
  const shouldShowSkeleton = Boolean(initializeStatus?.isLoading) || isRefreshing

  if (shouldShowSkeleton) {
    return <ClientsSkeleton />
  }

  useEffect(() => {
    if (!location?.hash) {
      setHighlightedClientId(null)
      return
    }

    if (!location.hash.startsWith('#client-')) {
      setHighlightedClientId(null)
      return
    }

    const clientId = location.hash.slice('#client-'.length)
    if (!clientId) {
      setHighlightedClientId(null)
      return
    }

    const exists = clients.some((client) => client.id === clientId)
    if (!exists) {
      setHighlightedClientId(null)
      return
    }

    setHighlightedClientId(clientId)

    const row = document.getElementById(`client-${clientId}`)
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [location?.hash, clients])

  const handleRetryLoad = async () => {
    setIsRetrying(true)
    try {
      await reloadClients()
      showToast({
        type: 'success',
        title: 'Clientes sincronizados',
        description: 'El listado se actualizó correctamente.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudieron cargar los clientes',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    } finally {
      setIsRetrying(false)
    }
  }

  const handleOpenImport = () => {
    setImportSummary(null)
    setIsImportModalOpen(true)
  }

  const handleCloseImport = () => {
    if (isImportingClients) {
      return
    }
    setIsImportModalOpen(false)
    setImportSummary(null)
  }

  const handleImportClients = async (file) => {
    setIsImportingClients(true)
    try {
      const summary = await importClients(file)
      setImportSummary(summary)
      const createdCount = Number(summary?.created_count ?? 0)
      const hasErrors = Number(summary?.failed_count ?? 0) > 0
      const description = hasErrors
        ? 'Revisa los detalles para corregir las filas con errores.'
        : createdCount > 0
          ? `Se agregaron ${createdCount} clientes correctamente.`
          : 'El archivo no generó registros nuevos.'
      showToast({
        type: hasErrors ? 'warning' : 'success',
        title: hasErrors ? 'Importación con advertencias' : 'Clientes importados',
        description,
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudieron importar los clientes',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    } finally {
      setIsImportingClients(false)
    }
  }

  const handleExportClients = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return
    }

    if (!Array.isArray(clients) || clients.length === 0) {
      showToast({
        type: 'info',
        title: 'Sin clientes para exportar',
        description: 'Agrega clientes o sincroniza antes de generar el archivo CSV.',
      })
      return
    }

    const headers = [
      'client_type',
      'full_name',
      'location',
      'base_id',
      'ip_address',
      'antenna_ip',
      'modem_ip',
      'monthly_fee',
      'paid_months_ahead',
      'debt_months',
      'service_status',
    ]

    const serializeRow = (row) =>
      row
        .map((value) => {
          if (value === null || typeof value === 'undefined') {
            return ''
          }

          const stringValue = String(value)
          const escapedValue = stringValue.replace(/"/g, '""')
          return /[",\n]/.test(stringValue) ? `"${escapedValue}"` : escapedValue
        })
        .join(',')

    const rows = clients.map((client) => [
      client.type ?? '',
      client.name ?? '',
      client.location ?? '',
      client.base ?? '',
      client.ip ?? '',
      client.antennaIp ?? '',
      client.modemIp ?? '',
      client.monthlyFee ?? '',
      client.paidMonthsAhead ?? '',
      client.debtMonths ?? '',
      client.service ?? '',
    ])

    const csvContent = [headers, ...rows].map(serializeRow).join('\r\n')

    try {
      const timestamp = new Date()
        .toISOString()
        .replace(/[:]/g, '-')
        .replace('T', '_')
        .split('.')[0]
      const blob = new window.Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.setAttribute('download', `clientes_${timestamp}.csv`)
      window.document.body.appendChild(link)
      link.click()
      window.document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      showToast({
        type: 'success',
        title: 'Exportación creada',
        description: `Se exportaron ${clients.length} cliente(s) al archivo CSV.`,
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo exportar',
        description: 'Ocurrió un error al generar el archivo. Intenta nuevamente.',
      })
    }
  }, [clients, showToast])

  const availableLocations = useMemo(() => {
    const unique = new Set(LOCATIONS)
    clients.forEach((client) => unique.add(client.location))
    return Array.from(unique)
  }, [clients])

  const assignedIpsByRange = useMemo(() => createAssignedIpIndex(clients), [clients])

  const availableIpsByRange = useMemo(
    () => getAvailableIpsByRange(assignedIpsByRange),
    [assignedIpsByRange],
  )

  const currentIpFields = CLIENT_IP_FIELDS_BY_TYPE[formState.type] ?? []

  const getAvailableIps = (rangeKey, base) =>
    availableIpsByRange[rangeKey]?.[String(base)] ?? []

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const matchesTerm = useCallback(
    (values) =>
      normalizedSearchTerm.length === 0 ||
      values.some((value) => {
        if (value === null || value === undefined) return false
        return value.toString().toLowerCase().includes(normalizedSearchTerm)
      }),
    [normalizedSearchTerm],
  )

  const residentialClients = useMemo(
    () => clients.filter((client) => (client.type ?? 'residential') === 'residential'),
    [clients],
  )
  const filteredResidentialClients = useMemo(() => {
    return residentialClients.filter((client) => {
      const searchValues = [
        client.name,
        client.location,
        ...(CLIENT_IP_FIELDS_BY_TYPE.residential ?? []).map(({ name }) => client[name]),
      ]
      if (!matchesTerm(searchValues)) return false

      if (locationFilter !== 'all' && client.location !== locationFilter) return false

      if (statusFilter === 'debt') return client.debtMonths > 0
      if (statusFilter === 'ok') return client.debtMonths === 0

      return true
    })
  }, [residentialClients, matchesTerm, locationFilter, statusFilter])

  const validateForm = () => {
    const errors = {}
    if (!formState.name.trim()) errors.name = 'El nombre es obligatorio.'
    const ipFields = CLIENT_IP_FIELDS_BY_TYPE[formState.type] ?? []
    ipFields.forEach(({ name, rangeKey, label }) => {
      const rawValue = formState[name]
      const value = typeof rawValue === 'string' ? rawValue.trim() : ''
      if (!value) {
        errors[name] = `Ingresa ${label.toLowerCase()}.`
        return
      }

      const baseRange = CLIENT_IP_RANGES[rangeKey]?.[formState.base]
      if (!baseRange) return

      if (!value.startsWith(baseRange.prefix)) {
        errors[name] = `La IP debe iniciar con ${baseRange.prefix}`
        return
      }

      const suffix = Number(value.split('.').pop())
      const isValidSuffix =
        Number.isInteger(suffix) && suffix >= baseRange.start && suffix <= baseRange.end
      if (!isValidSuffix) {
        errors[name] = `La IP debe estar entre ${baseRange.prefix}${baseRange.start} y ${baseRange.prefix}${baseRange.end}.`
        return
      }

      const used = assignedIpsByRange[rangeKey]?.[String(formState.base)] ?? new Set()
      if (used.has(value)) {
        errors[name] = 'La IP seleccionada ya está en uso.'
      }
    })

    if (formState.type === 'residential') {
      if (!Number.isInteger(Number(formState.debtMonths)) || Number(formState.debtMonths) < 0) {
        errors.debtMonths = 'Los periodos pendientes no pueden ser negativos.'
      }
      if (
        !Number.isInteger(Number(formState.paidMonthsAhead)) ||
        Number(formState.paidMonthsAhead) < 0
      ) {
        errors.paidMonthsAhead = 'Los periodos adelantados no pueden ser negativos.'
      }
      const monthlyFeeValue = Number(formState.monthlyFee)
      if (!Number.isFinite(monthlyFeeValue) || monthlyFeeValue <= 0) {
        errors.monthlyFee = 'Ingresa un monto mensual mayor a cero.'
      }
    } else {
      if (!formState.modemModel.trim()) {
        errors.modemModel = 'Describe el módem instalado en el cliente.'
      }
    }
    const debtValue = Number(formState.debtMonths)
    if (!Number.isFinite(debtValue) || debtValue < 0) {
      errors.debtMonths = 'Los periodos pendientes no pueden ser negativos.'
    }
    const aheadValue = Number(formState.paidMonthsAhead)
    if (!Number.isFinite(aheadValue) || aheadValue < 0) {
      errors.paidMonthsAhead = 'Los periodos adelantados no pueden ser negativos.'
    }
    const monthlyFeeValue = Number(formState.monthlyFee)
    if (!Number.isFinite(monthlyFeeValue) || monthlyFeeValue <= 0) {
      errors.monthlyFee = 'Ingresa un monto mensual mayor a cero.'
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validateForm()) return

    const payload = {
      type: formState.type,
      name: formState.name.trim(),
      location: formState.location,
      base: Number(formState.base) || 1,
      debtMonths: formState.type === 'residential' ? Number(formState.debtMonths) || 0 : 0,
      paidMonthsAhead:
        formState.type === 'residential' ? Number(formState.paidMonthsAhead) || 0 : 0,
      monthlyFee:
        formState.type === 'residential'
          ? Number(formState.monthlyFee) || CLIENT_PRICE
          : 0,
    }

    if (formState.type === 'residential') {
      payload.ip = formState.ip.trim()
    } else {
      payload.antennaIp = formState.antennaIp.trim()
      payload.modemIp = formState.modemIp.trim()
      payload.antennaModel = formState.antennaModel
      payload.modemModel = formState.modemModel.trim()
    }

    try {
      await createClient(payload)
      showToast({
        type: 'success',
        title: 'Cliente agregado',
        description: `Se agregó a ${formState.name.trim()} correctamente.`,
      })
      setFormState({ ...defaultForm })
      setFormErrors({})
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo agregar el cliente',
        description: error?.message ?? 'Intenta nuevamente.',
      })
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
      <section aria-labelledby="nuevo" className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 id="nuevo" className="text-lg font-semibold text-slate-900">
              Agregar nuevo cliente
            </h2>
            <p className="text-sm text-slate-500">
              Completa los campos requeridos. Los datos se guardan automáticamente en tu dispositivo.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:justify-end">
            <Button
              type="button"
              onClick={handleOpenImport}
              className="w-full md:w-auto md:self-center"
            >
              Importar clientes
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleExportClients}
              className="w-full border border-slate-200 bg-white text-slate-700 hover:border-blue-200 md:w-auto md:self-center"
            >
              Exportar clientes
            </Button>
          </div>
        </div>

        <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Tipo de cliente
              <select
                value={formState.type}
                onChange={(event) => {
                  const newType = event.target.value
                  setFormState((prev) => {
                    const updated = {
                      ...prev,
                      type: newType,
                    }

                    const previousFields = CLIENT_IP_FIELDS_BY_TYPE[prev.type] ?? []
                    const nextFields = CLIENT_IP_FIELDS_BY_TYPE[newType] ?? []

                    previousFields.forEach(({ name }) => {
                      if (!nextFields.some((field) => field.name === name)) {
                        updated[name] = ''
                      }
                    })

                    nextFields.forEach(({ name }) => {
                      if (typeof updated[name] === 'undefined') {
                        updated[name] = ''
                      }
                    })

                    if (newType === 'token') {
                      updated.monthlyFee = 0
                      updated.debtMonths = 0
                      updated.paidMonthsAhead = 0
                      updated.modemModel = ''
                      updated.antennaModel = CLIENT_ANTENNA_MODELS[0]
                    } else if (prev.type === 'token') {
                      updated.monthlyFee = CLIENT_PRICE
                    }

                    return updated
                  })
                  setFormErrors({})
                }}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {Object.entries(CLIENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Nombre completo
              <input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                className={`rounded-md border px-3 py-2 text-sm ${
                  formErrors.name ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : 'border-slate-300'
                }`}
                placeholder="Juan Pérez"
                autoComplete="off"
              />
              {formErrors.name && (
                <span className="text-xs font-medium text-red-600">{formErrors.name}</span>
              )}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Localidad
              <select
                value={formState.location}
                onChange={(event) => setFormState((prev) => ({ ...prev, location: event.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {availableLocations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Base
              <select
                value={formState.base}
                onChange={(event) => setFormState((prev) => ({ ...prev, base: Number(event.target.value) }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value={1}>Base 1</option>
                <option value={2}>Base 2</option>
              </select>
            </label>

            {currentIpFields.map(({ name, label, rangeKey }) => (
              <label key={name} className="grid gap-1 text-xs font-medium text-slate-600">
                {label}
                <select
                  value={formState[name] ?? ''}
                  onChange={(event) => setFormState((prev) => ({ ...prev, [name]: event.target.value }))}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    formErrors[name] ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : 'border-slate-300'
                  }`}
                >
                  <option value="">Selecciona una IP disponible</option>
                  {getAvailableIps(rangeKey, formState.base).map((ip) => (
                    <option key={ip} value={ip}>
                      {ip}
                    </option>
                  ))}
                </select>
                {formErrors[name] && (
                  <span className="text-xs font-medium text-red-600">{formErrors[name]}</span>
                )}
              </label>
            ))}
          </div>

          {formState.type === 'residential' ? (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Pago mensual (MXN)
                <input
                  value={formState.monthlyFee}
                  onChange={(event) => setFormState((prev) => ({ ...prev, monthlyFee: event.target.value }))}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  className={`rounded-md border px-3 py-2 text-sm ${
                    formErrors.monthlyFee
                      ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                      : 'border-slate-300'
                  }`}
                />
                {formErrors.monthlyFee && (
                  <span className="text-xs font-medium text-red-600">{formErrors.monthlyFee}</span>
                )}
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Periodos pendientes
                <input
                  value={formState.debtMonths}
                  onChange={(event) => setFormState((prev) => ({ ...prev, debtMonths: event.target.value }))}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className={`rounded-md border px-3 py-2 text-sm ${
                    formErrors.debtMonths
                      ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                      : 'border-slate-300'
                  }`}
                />
                {formErrors.debtMonths && (
                  <span className="text-xs font-medium text-red-600">{formErrors.debtMonths}</span>
                )}
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Periodos adelantados
                <input
                  value={formState.paidMonthsAhead}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, paidMonthsAhead: event.target.value }))
                  }
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className={`rounded-md border px-3 py-2 text-sm ${
                    formErrors.paidMonthsAhead
                      ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                      : 'border-slate-300'
                  }`}
                />
                {formErrors.paidMonthsAhead && (
                  <span className="text-xs font-medium text-red-600">{formErrors.paidMonthsAhead}</span>
                )}
              </label>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Modelo de antena
                <select
                  value={formState.antennaModel}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, antennaModel: event.target.value }))
                  }
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {CLIENT_ANTENNA_MODELS.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Modelo de módem
                <input
                  value={formState.modemModel}
                  onChange={(event) => setFormState((prev) => ({ ...prev, modemModel: event.target.value }))}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    formErrors.modemModel
                      ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                      : 'border-slate-300'
                  }`}
                  placeholder="Ej. TP-Link WR840N"
                />
                {formErrors.modemModel && (
                  <span className="text-xs font-medium text-red-600">{formErrors.modemModel}</span>
                )}
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Periodos adelantados
                <input
                  value={formState.paidMonthsAhead}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, paidMonthsAhead: event.target.value }))
                  }
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className={`rounded-md border px-3 py-2 text-sm ${
                    formErrors.paidMonthsAhead
                      ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                      : 'border-slate-300'
                  }`}
                />
                {formErrors.paidMonthsAhead && (
                  <span className="text-xs font-medium text-red-600">{formErrors.paidMonthsAhead}</span>
                )}
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
              onClick={() => {
                setFormState({ ...defaultForm })
                setFormErrors({})
              }}
            >
              Limpiar
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500/40"
              disabled={isMutatingClients}
            >
              Guardar cliente
            </Button>
          </div>
        </form>
      </section>
      <ImportClientsModal
        isOpen={isImportModalOpen}
        onClose={handleCloseImport}
        onSubmit={handleImportClients}
        isProcessing={isImportingClients}
        summary={importSummary}
      />

      <section aria-labelledby="listado" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="listado" className="text-lg font-semibold text-slate-900">
              Listado de clientes
            </h2>
            <p className="text-sm text-slate-500">
              Busca por nombre, localidad, equipo o dirección IP y gestiona los servicios activos.
            </p>
          </div>
          <p className="text-sm text-slate-500" role="status">
            Clientes residenciales: {filteredResidentialClients.length}
          </p>
        </div>

        {isLoadingClients && (
          <div
            role="status"
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700"
          >
            Cargando clientes…
          </div>
        )}
        {!isLoadingClients && isSyncingClients && (
          <div
            role="status"
            className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-600"
          >
            Sincronizando cambios recientes…
          </div>
        )}
        {hasClientsError && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            <span>No se pudo cargar el listado de clientes. Intenta nuevamente.</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="border border-red-200 bg-white text-red-700 hover:border-red-300"
              onClick={handleRetryLoad}
              disabled={isRetrying}
            >
              {isRetrying ? 'Reintentando…' : 'Reintentar'}
            </Button>
          </div>
        )}

        <Card>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-4">
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Buscar
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  type="search"
                  placeholder="Nombre, localidad o IP"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Localidad
                <select
                  value={locationFilter}
                  onChange={(event) => setLocationFilter(event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="all">Todas</option>
                  {availableLocations.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Estado
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="debt">Pendientes</option>
                  <option value="ok">Al día / Activos</option>
                </select>
              </label>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
                  onClick={() => {
                    setSearchTerm('')
                    setLocationFilter('all')
                    setStatusFilter('all')
                  }}
                >
                  Limpiar filtros
                </Button>
              </div>
            </div>

            <div className="space-y-6">
              <section aria-label="Clientes residenciales" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Clientes residenciales</h3>
                    <p className="text-xs text-slate-500">
                      Control de pagos y estado del servicio mensual.
                    </p>
                  </div>
                  <span className="text-xs text-slate-500" role="status">
                    {filteredResidentialClients.length} registro(s)
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Cliente
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Localidad
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Base
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Servicio
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Pago mensual
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Deuda
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredResidentialClients.map((client) => (
                        <tr
                          key={client.id}
                          id={`client-${client.id}`}
                          className={
                            highlightedClientId === client.id
                              ? 'bg-blue-50/70 transition-colors'
                              : undefined
                          }
                        >
                          <td className="px-3 py-2 font-medium text-slate-900">
                            <div className="flex flex-col">
                              <span>{client.name}</span>
                              {client.ip && (
                                <span className="text-xs text-slate-500">IP: {client.ip}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{client.location}</td>
                          <td className="px-3 py-2 text-slate-600">Base {client.base}</td>
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
                          <td className="px-3 py-2 text-slate-600">
                            {peso(client.monthlyFee ?? CLIENT_PRICE)}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {client.debtMonths > 0
                              ? `${client.debtMonths} ${
                                  client.debtMonths === 1 ? 'periodo' : 'periodos'
                                }`
                              : 'Sin deuda'}
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
                      {filteredResidentialClients.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                            No se encontraron clientes residenciales.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

            </div>
          </CardContent>
        </Card>
      </section>

    </div>
  )
}
