import React, { useMemo, useState } from 'react'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { CLIENT_PRICE, useBackofficeStore } from '../store/useBackofficeStore.js'
import { peso } from '../utils/formatters.js'

const LOCATIONS = ['Nuevo Amatenango', 'Zapotal', 'Naranjal', 'Belén', 'Lagunita']

const CLIENT_TYPE_LABELS = {
  residential: 'Cliente residencial',
  token: 'Cliente con fichas',
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
  const { clients, addClient, toggleClientService } = useBackofficeStore((state) => ({
    clients: state.clients,
    addClient: state.addClient,
    toggleClientService: state.toggleClientService,
  }))
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [formState, setFormState] = useState({ ...defaultForm })
  const [formErrors, setFormErrors] = useState({})
  const [feedback, setFeedback] = useState(null)

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

  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return clients.filter((client) => {
      const matchesTerm =
        term.length === 0 ||
        client.name.toLowerCase().includes(term) ||
        client.location.toLowerCase().includes(term)
      const matchesLocation = locationFilter === 'all' || client.location === locationFilter
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'debt'
            ? client.debtMonths > 0
            : client.debtMonths === 0
      return matchesTerm && matchesLocation && matchesStatus
    })
  }, [clients, searchTerm, locationFilter, statusFilter])

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
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = (event) => {
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

    addClient(payload)

    setFeedback({ type: 'success', message: `Se agregó a ${formState.name.trim()} correctamente.` })
    setFormState({ ...defaultForm })
    setFormErrors({})
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
              Busca por nombre o localidad, filtra por estado y gestiona servicios activos.
            </p>
          </div>
          <p className="text-sm text-slate-500" role="status">
            {filteredClients.length} registro(s) encontrados.
          </p>
        </div>

        {feedback && feedback.type === 'success' && (
          <div role="alert" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {feedback.message}
          </div>
        )}

        <Card>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Buscar
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  type="search"
                  placeholder="Nombre o localidad"
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
                  <option value="ok">Al día</option>
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
                      Tipo
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Equipamiento
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
                  {filteredClients.map((client) => (
                    <tr key={client.id}>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        <div className="flex flex-col">
                          <span>{client.name}</span>
                          {(IP_FIELDS_BY_TYPE[client.type ?? 'residential'] ?? [])
                            .map(({ name, label }) => ({
                              label,
                              value: client[name],
                            }))
                            .filter(({ value }) => Boolean(value))
                            .map(({ label, value }) => (
                              <span key={label} className="text-xs text-slate-500">
                                {label}: {value}
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{client.location}</td>
                      <td className="px-3 py-2 text-slate-600">Base {client.base}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {CLIENT_TYPE_LABELS[client.type ?? 'residential']}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {client.type === 'token' ? (
                          <div className="flex flex-col text-xs text-slate-500">
                            <span>Antena: {client.antennaModel || 'Sin dato'}</span>
                            <span>Módem: {client.modemModel || 'Sin dato'}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Servicio residencial</span>
                        )}
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
                      <td className="px-3 py-2 text-slate-600">
                        {client.type === 'token'
                          ? 'Sin mensualidad'
                          : peso(client.monthlyFee ?? CLIENT_PRICE)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {client.type === 'token'
                          ? 'No aplica'
                          : client.debtMonths > 0
                            ? `${client.debtMonths} ${
                                client.debtMonths === 1 ? 'periodo' : 'periodos'
                              }`
                            : 'Sin deuda'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
                          onClick={() => toggleClientService(client.id)}
                        >
                          {client.service === 'Activo' ? 'Suspender' : 'Activar'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredClients.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500">
                        No se encontraron clientes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
            {formState.type === 'token' && (
              <>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Modelo de antena
                  <select
                    value={formState.antennaModel}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, antennaModel: event.target.value }))
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {ANTENNA_MODELS.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Módem / Router instalado
                  <input
                    value={formState.modemModel}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, modemModel: event.target.value }))
                    }
                    className={`rounded-md border px-3 py-2 text-sm ${
                      formErrors.modemModel
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                        : 'border-slate-300'
                    }`}
                    placeholder="Ej. Router TP-Link"
                    required
                  />
                  {formErrors.modemModel && (
                    <span className="text-xs text-red-600">{formErrors.modemModel}</span>
                  )}
                </label>
              </>
            )}
            {formState.type === 'residential' && (
              <>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Pago mensual
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    value={formState.monthlyFee}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, monthlyFee: event.target.value }))
                    }
                    className={`rounded-md border px-3 py-2 text-sm ${
                      formErrors.monthlyFee
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                        : 'border-slate-300'
                    }`}
                  />
                  {formErrors.monthlyFee && (
                    <span className="text-xs text-red-600">{formErrors.monthlyFee}</span>
                  )}
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Periodos pendientes
                  <input
                    type="number"
                    min={0}
                    value={formState.debtMonths}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, debtMonths: event.target.value }))
                    }
                    className={`rounded-md border px-3 py-2 text-sm ${
                      formErrors.debtMonths
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                        : 'border-slate-300'
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
                    value={formState.paidMonthsAhead}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, paidMonthsAhead: event.target.value }))
                    }
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
              </>
            )}
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
            <Button type="submit">Guardar cliente</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
