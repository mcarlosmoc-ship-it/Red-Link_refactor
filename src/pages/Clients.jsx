import React, { useCallback, useMemo, useState } from 'react'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { CLIENT_PRICE } from '../store/useBackofficeStore.js'
import { useClients } from '../hooks/useClients.js'
import { useToast } from '../hooks/useToast.js'
import { peso } from '../utils/formatters.js'

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

const IP_RANGES = {
  residential: {
    1: { prefix: '192.168.3.', start: 1, end: 254 },
    2: { prefix: '192.168.200.', start: 1, end: 254 },
  },
  tokenAntenna: {
    1: { prefix: '192.168.4.', start: 1, end: 254 },
    2: { prefix: '192.168.90.', start: 1, end: 254 },
  },
  tokenModem: {
    1: { prefix: '192.168.5.', start: 1, end: 254 },
    2: { prefix: '192.168.91.', start: 1, end: 254 },
  },
}

const IP_FIELDS_BY_TYPE = {
  residential: [
    { name: 'ip', label: 'Dirección IP', placeholder: '192.168.3.10', rangeKey: 'residential' },
  ],
  token: [
    { name: 'antennaIp', label: 'IP de la antena', placeholder: '192.168.4.10', rangeKey: 'tokenAntenna' },
    { name: 'modemIp', label: 'IP del módem', placeholder: '192.168.5.10', rangeKey: 'tokenModem' },
  ],
}

const ANTENNA_MODELS = ['LiteBeam', 'Loco M5']

const IP_OPTIONS = Object.fromEntries(
  Object.entries(IP_RANGES).map(([rangeKey, baseRanges]) => [
    rangeKey,
    Object.fromEntries(
      Object.entries(baseRanges).map(([base, { prefix, start, end }]) => [
        base,
        Array.from({ length: end - start + 1 }, (_, index) => `${prefix}${start + index}`),
      ]),
    ),
  ]),
)

const defaultForm = {
  type: 'residential',
  name: '',
  location: LOCATIONS[0],
  base: 1,
  ip: '',
  antennaIp: '',
  modemIp: '',
  antennaModel: ANTENNA_MODELS[0],
  modemModel: '',
  debtMonths: 0,
  paidMonthsAhead: 0,
  monthlyFee: CLIENT_PRICE,
}

export default function ClientsPage() {
  const {
    clients,
    status: clientsStatus,
    reload: reloadClients,
    createClient,
    toggleClientService,
  } = useClients()
  const { showToast } = useToast()
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [formState, setFormState] = useState({ ...defaultForm })
  const [formErrors, setFormErrors] = useState({})
  const [isRetrying, setIsRetrying] = useState(false)
  const isMutatingClients = Boolean(clientsStatus?.isMutating)
  const isSyncingClients = Boolean(clientsStatus?.isLoading)
  const isLoadingClients = Boolean(clientsStatus?.isLoading && clients.length === 0)
  const hasClientsError = Boolean(clientsStatus?.error)

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

  const availableLocations = useMemo(() => {
    const unique = new Set(LOCATIONS)
    clients.forEach((client) => unique.add(client.location))
    return Array.from(unique)
  }, [clients])

  const assignedIpsByRange = useMemo(() => {
    const result = {}
    clients.forEach((client) => {
      const type = client.type ?? 'residential'
      const baseKey = String(client.base ?? 1)
      const ipFields = IP_FIELDS_BY_TYPE[type] ?? []
      ipFields.forEach(({ name, rangeKey }) => {
        const value = client[name]
        if (!value) return
        if (!result[rangeKey]) result[rangeKey] = {}
        if (!result[rangeKey][baseKey]) result[rangeKey][baseKey] = new Set()
        result[rangeKey][baseKey].add(value)
      })
    })
    return result
  }, [clients])

  const availableIpsByRange = useMemo(() => {
    const result = {}
    Object.entries(IP_OPTIONS).forEach(([rangeKey, baseOptions]) => {
      result[rangeKey] = {}
      Object.entries(baseOptions).forEach(([baseKey, options]) => {
        const used = assignedIpsByRange[rangeKey]?.[baseKey] ?? new Set()
        result[rangeKey][baseKey] = options.filter((ip) => !used.has(ip))
      })
    })
    return result
  }, [assignedIpsByRange])

  const currentIpFields = IP_FIELDS_BY_TYPE[formState.type] ?? []

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
  const tokenClients = useMemo(
    () => clients.filter((client) => client.type === 'token'),
    [clients],
  )

  const filteredResidentialClients = useMemo(() => {
    return residentialClients.filter((client) => {
      const searchValues = [
        client.name,
        client.location,
        ...(IP_FIELDS_BY_TYPE.residential ?? []).map(({ name }) => client[name]),
      ]
      if (!matchesTerm(searchValues)) return false

      if (locationFilter !== 'all' && client.location !== locationFilter) return false

      if (statusFilter === 'debt') return client.debtMonths > 0
      if (statusFilter === 'ok') return client.debtMonths === 0

      return true
    })
  }, [residentialClients, matchesTerm, locationFilter, statusFilter])

  const filteredTokenClients = useMemo(() => {
    return tokenClients.filter((client) => {
      const searchValues = [
        client.name,
        client.location,
        client.antennaModel,
        client.modemModel,
        client.antennaIp,
        client.modemIp,
      ]
      if (!matchesTerm(searchValues)) return false

      if (locationFilter !== 'all' && client.location !== locationFilter) return false

      if (statusFilter === 'debt') return false
      if (statusFilter === 'ok') return client.service === 'Activo'

      return true
    })
  }, [tokenClients, matchesTerm, locationFilter, statusFilter])

  const tokenInventoryByBase = useMemo(() => {
    const countsByBase = tokenClients.reduce((acc, client) => {
      const baseKey = String(client.base ?? 1)
      acc[baseKey] = (acc[baseKey] ?? 0) + 1
      return acc
    }, {})

    return Object.keys(IP_RANGES.tokenAntenna).map((baseKey) => {
      const antennaSet = assignedIpsByRange.tokenAntenna?.[baseKey]
      const modemSet = assignedIpsByRange.tokenModem?.[baseKey]
      const antennaAvailable = availableIpsByRange.tokenAntenna?.[baseKey] ?? []
      const modemAvailable = availableIpsByRange.tokenModem?.[baseKey] ?? []

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
  }, [tokenClients, assignedIpsByRange, availableIpsByRange])

  const validateForm = () => {
    const errors = {}
    if (!formState.name.trim()) errors.name = 'El nombre es obligatorio.'
    const ipFields = IP_FIELDS_BY_TYPE[formState.type] ?? []
    ipFields.forEach(({ name, rangeKey, label }) => {
      const rawValue = formState[name]
      const value = typeof rawValue === 'string' ? rawValue.trim() : ''
      if (!value) {
        errors[name] = `Ingresa ${label.toLowerCase()}.`
        return
      }

      const baseRange = IP_RANGES[rangeKey]?.[formState.base]
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
            Residenciales: {filteredResidentialClients.length} • Antenas públicas: {filteredTokenClients.length}
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
                        <tr key={client.id}>
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

              <section aria-label="Antenas públicas" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Antenas públicas instaladas</h3>
                    <p className="text-xs text-slate-500">
                      Controla tus antenas, los módems instalados y las direcciones IP asignadas.
                    </p>
                  </div>
                  <span className="text-xs text-slate-500" role="status">
                    {filteredTokenClients.length} registro(s)
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {tokenInventoryByBase.map((info) => (
                    <div
                      key={info.base}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600"
                    >
                      <h4 className="text-sm font-semibold text-slate-700">Base {info.base}</h4>
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
                          Antena instalada
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Módem / Router
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
                            No se encontraron antenas públicas instaladas con los filtros actuales.
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

      <section aria-labelledby="nuevo" className="space-y-4">
        <div>
          <h2 id="nuevo" className="text-lg font-semibold text-slate-900">
            Agregar nuevo cliente
          </h2>
          <p className="text-sm text-slate-500">
            Completa los campos requeridos. Los datos se guardan automáticamente en tu dispositivo.
          </p>
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

                    const previousFields = IP_FIELDS_BY_TYPE[prev.type] ?? []
                    const nextFields = IP_FIELDS_BY_TYPE[newType] ?? []

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
                      updated.antennaModel = ANTENNA_MODELS[0]
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
                placeholder="Ej. Juan Pérez"
                required
              />
              {formErrors.name && <span className="text-xs text-red-600">{formErrors.name}</span>}
            </label>
            {currentIpFields.map(({ name, label, placeholder, rangeKey }) => {
              const availableIps = getAvailableIps(rangeKey, formState.base)
              const datalistId = `ip-options-${name}`
              return (
                <label key={name} className="grid gap-1 text-xs font-medium text-slate-600">
                  {label}
                  <input
                    value={formState[name]}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, [name]: event.target.value }))
                    }
                    className={`rounded-md border px-3 py-2 text-sm ${
                      formErrors[name]
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                        : 'border-slate-300'
                    }`}
                    placeholder={placeholder}
                    list={datalistId}
                    required
                  />
                  <datalist id={datalistId}>
                    {availableIps.map((ip) => (
                      <option key={ip} value={ip} />
                    ))}
                  </datalist>
                  <span className="text-[11px] text-slate-500">
                    {availableIps.length > 0
                      ? 'Selecciona una IP disponible del listado.'
                      : 'No hay direcciones IP disponibles en esta base.'}
                  </span>
                  {formErrors[name] && (
                    <span className="text-xs text-red-600">{formErrors[name]}</span>
                  )}
                </label>
              )
            })}
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
                onChange={(event) => {
                  const newBase = Number(event.target.value)
                  setFormState((prev) => {
                    const updated = { ...prev, base: newBase }
                    const nextFields = IP_FIELDS_BY_TYPE[prev.type] ?? []
                    nextFields.forEach(({ name, rangeKey }) => {
                      const validOptions = getAvailableIps(rangeKey, newBase)
                      if (!validOptions.includes(prev[name])) {
                        updated[name] = ''
                      }
                    })
                    return updated
                  })
                }}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value={1}>Base 1</option>
                <option value={2}>Base 2</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Pago mensual
              <input
                type="number"
                min={1}
                step="0.01"
                value={formState.monthlyFee}
                onChange={(event) => setFormState((prev) => ({ ...prev, monthlyFee: event.target.value }))}
                className={`rounded-md border px-3 py-2 text-sm ${
                  formErrors.monthlyFee
                    ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                    : 'border-slate-300'
                }`}
              />
              {formErrors.monthlyFee && <span className="text-xs text-red-600">{formErrors.monthlyFee}</span>}
            </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Periodos pendientes
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formState.debtMonths}
                  onChange={(event) => setFormState((prev) => ({ ...prev, debtMonths: event.target.value }))}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    formErrors.debtMonths ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : 'border-slate-300'
                  }`}
                />
              {formErrors.debtMonths && (
                <span className="text-xs text-red-600">{formErrors.debtMonths}</span>
              )}
            </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Periodos adelantados
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formState.paidMonthsAhead}
                  onChange={(event) => setFormState((prev) => ({ ...prev, paidMonthsAhead: event.target.value }))}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    formErrors.paidMonthsAhead
                      ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                    : 'border-slate-300'
                }`}
                />
                {formErrors.paidMonthsAhead && (
                  <span className="text-xs text-red-600">{formErrors.paidMonthsAhead}</span>
                )}
            </label>
          </div>

          <div className="flex justify-end gap-2">
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
              disabled={isMutatingClients}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isMutatingClients ? 'Guardando…' : 'Guardar cliente'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
