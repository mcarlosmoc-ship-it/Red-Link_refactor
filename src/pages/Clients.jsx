import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import InfoTooltip from '../components/ui/InfoTooltip.jsx'
import ImportClientsModal from '../components/clients/ImportClientsModal.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { CLIENT_PRICE, useBackofficeStore } from '../store/useBackofficeStore.js'
import { useClients } from '../hooks/useClients.js'
import { useServicePlans } from '../hooks/useServicePlans.js'
import { useToast } from '../hooks/useToast.js'
import { peso, formatDate, formatPeriodLabel, addMonthsToPeriod } from '../utils/formatters.js'
import {
  SERVICE_TYPE_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  getServiceTypeLabel,
  getServiceStatusLabel,
} from '../constants/serviceTypes.js'
import { computeServiceFormErrors } from '../utils/serviceFormValidation.js'
import {
  CLIENT_ANTENNA_MODELS,
  CLIENT_IP_FIELDS_BY_TYPE,
  CLIENT_IP_RANGES,
  createAssignedIpIndex,
  getAvailableIpsByRange,
} from '../utils/clientIpConfig.js'
import { useBackofficeRefresh } from '../contexts/BackofficeRefreshContext.jsx'
import ClientsSkeleton from './ClientsSkeleton.jsx'
import MonthlyServicesPage from './MonthlyServices.jsx'

const periodsFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })

const formatPeriods = (value) => {
  const numericValue = Number(value) || 0
  return periodsFormatter.format(numericValue)
}

const isApproximatelyOne = (value) => Math.abs(Number(value) - 1) < 0.01

const FRACTION_EPSILON = 0.0001

const LOCATIONS = ['Nuevo Amatenango', 'Zapotal', 'Naranjal', 'Belén', 'Lagunita']

const MAIN_TABS = [
  { id: 'clients', label: 'Clientes' },
  { id: 'services', label: 'Servicios mensuales' },
]

const CLIENT_TYPE_LABELS = {
  residential: 'Cliente residencial',
  token: 'Punto con antena pública',
}

const formatServiceStatus = (status) => getServiceStatusLabel(status)

const formatServiceType = (type) => getServiceTypeLabel(type)

const formatServicePlanOptionLabel = (plan) => {
  const fee = Number(plan?.defaultMonthlyFee)
  if (Number.isFinite(fee) && fee > 0) {
    return `${plan.name} · ${peso(fee)}`
  }
  return `${plan.name} · Monto variable`
}

const getPrimaryService = (client) => {
  const services = Array.isArray(client?.services) ? client.services : []
  if (services.length === 0) {
    return null
  }
  return services.find((service) => service.type?.startsWith('internet_')) ?? services[0]
}

const normalizeId = (value) => {
  if (value === null || value === undefined) {
    return null
  }
  return String(value)
}

const createInitialServiceState = (baseId) => ({
  displayName: getServiceTypeLabel('internet_private'),
  serviceType: 'internet_private',
  price: '',
  billingDay: '',
  baseId: baseId ? String(baseId) : '',
  status: 'active',
  notes: '',
  servicePlanId: '',
})

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

const ACTION_BUTTON_CLASSES =
  'border border-slate-200 bg-white text-slate-700 hover:border-blue-200 disabled:cursor-not-allowed disabled:opacity-50'

export default function ClientsPage() {
  const { initializeStatus, selectedPeriod, currentPeriod } = useBackofficeStore((state) => ({
    initializeStatus: state.status.initialize,
    selectedPeriod: state.periods?.selected ?? state.periods?.current ?? null,
    currentPeriod: state.periods?.current ?? state.periods?.selected ?? null,
  }))
  const { isRefreshing } = useBackofficeRefresh()
  const {
    clients,
    status: clientsStatus,
    reload: reloadClients,
    createClient,
    createClientService,
    updateClientServiceStatus,
    deleteClient,
    importClients,
  } = useClients()
  const {
    servicePlans,
    status: servicePlansStatus,
    isLoading: isLoadingServicePlans,
  } = useServicePlans()
  const { showToast } = useToast()
  const location = useLocation()
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [activeMainTab, setActiveMainTab] = useState('clients')
  const [isClientFormOpen, setIsClientFormOpen] = useState(false)
  const [formState, setFormState] = useState({ ...defaultForm })
  const [formErrors, setFormErrors] = useState({})
  const [isRetrying, setIsRetrying] = useState(false)
  const [highlightedClientId, setHighlightedClientId] = useState(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [isImportingClients, setIsImportingClients] = useState(false)
  const [requiresImportConfirmation, setRequiresImportConfirmation] = useState(false)
  const [sortField, setSortField] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [isAddingService, setIsAddingService] = useState(false)
  const [initialServiceState, setInitialServiceState] = useState(() =>
    createInitialServiceState(defaultForm.base),
  )
  const [initialServiceErrors, setInitialServiceErrors] = useState({})
  const [serviceFormState, setServiceFormState] = useState({
    displayName: '',
    serviceType: 'other',
    price: '',
    billingDay: '',
    baseId: '',
    notes: '',
  })
  const [serviceFormErrors, setServiceFormErrors] = useState({})
  const activeServicePlans = useMemo(
    () => servicePlans.filter((plan) => plan.isActive),
    [servicePlans],
  )
  const servicePlanOptions = useMemo(
    () =>
      activeServicePlans
        .map((plan) => ({
          value: String(plan.id),
          label: formatServicePlanOptionLabel(plan),
          plan,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })),
    [activeServicePlans],
  )
  const clientDetailsRef = useRef(null)
  const shouldOpenServiceFormRef = useRef(false)
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
    const normalizedClientId = normalizeId(clientId)
    if (!normalizedClientId) {
      setHighlightedClientId(null)
      return
    }

    const exists = clients.some((client) => normalizeId(client.id) === normalizedClientId)
    if (!exists) {
      setHighlightedClientId(null)
      return
    }

    setHighlightedClientId(normalizedClientId)

    const row = document.getElementById(`client-${normalizedClientId}`)
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [location?.hash, clients])

  useEffect(() => {
    if (location.hash?.startsWith('#client-')) {
      setActiveMainTab('clients')
      return
    }

    const params = new window.URLSearchParams(location.search ?? '')
    const tabParam = params.get('tab')
    const normalizedHash = location.hash ? location.hash.replace('#', '') : ''

    if (tabParam === 'services' || normalizedHash === 'servicios' || normalizedHash === 'services') {
      setActiveMainTab('services')
      return
    }

    if (tabParam === 'clients' || normalizedHash === 'clientes') {
      setActiveMainTab('clients')
    }
  }, [location.hash, location.search])

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

  const handleSelectMainTab = useCallback((tabId) => {
    setActiveMainTab(tabId)
    if (tabId !== 'clients') {
      setIsClientFormOpen(false)
    }
  }, [])

  const handleToggleClientForm = useCallback(() => {
    setIsClientFormOpen((previous) => {
      if (previous) {
        setFormState({ ...defaultForm })
        setFormErrors({})
        setInitialServiceState(createInitialServiceState(defaultForm.base))
        setInitialServiceErrors({})
      } else {
        setFormErrors({})
        setInitialServiceErrors({})
      }
      return !previous
    })
  }, [])

  const handleOpenImport = () => {
    setImportSummary(null)
    setRequiresImportConfirmation(false)
    setIsImportModalOpen(true)
  }

  const handleCloseImport = () => {
    if (isImportingClients) {
      return
    }
    setIsImportModalOpen(false)
    setImportSummary(null)
    setRequiresImportConfirmation(false)
  }

  const handleImportClients = async (file) => {
    setIsImportingClients(true)
    try {
      const summary = await importClients(file)
      setImportSummary(summary)
      const createdCount = Number(summary?.created_count ?? 0)
      const hasErrors = Number(summary?.failed_count ?? 0) > 0
      const hasSuggestions = Array.isArray(summary?.errors) && summary.errors.length > 0
      const requiresConfirmation = hasErrors || hasSuggestions
      setRequiresImportConfirmation(requiresConfirmation)
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
      if (!requiresConfirmation) {
        setIsImportModalOpen(false)
        setImportSummary(null)
      }
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

  const handleConfirmImportSummary = () => {
    if (isImportingClients) {
      return
    }
    setIsImportModalOpen(false)
    setImportSummary(null)
    setRequiresImportConfirmation(false)
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

  const sortedResidentialClients = useMemo(() => {
    const sorted = [...filteredResidentialClients]
    const directionMultiplier = sortDirection === 'desc' ? -1 : 1
    sorted.sort((a, b) => {
      if (sortField === 'location') {
        return directionMultiplier * a.location.localeCompare(b.location)
      }
      return directionMultiplier * a.name.localeCompare(b.name)
    })
    return sorted
  }, [filteredResidentialClients, sortField, sortDirection])

  const handleSort = useCallback((field) => {
    setSortField((currentField) => {
      if (currentField === field) {
        setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'))
        return currentField
      }

      setSortDirection('asc')
      return field
    })
  }, [])

  useEffect(() => {
    if (!selectedClientId) {
      return
    }

    const exists = clients.some((client) => normalizeId(client.id) === selectedClientId)
    if (!exists) {
      setSelectedClientId(null)
    }
  }, [clients, selectedClientId])

  useEffect(() => {
    const baseValue = Number(formState.base)
    const nextBaseId = Number.isFinite(baseValue) ? String(baseValue) : ''
    setInitialServiceState((prev) => {
      if (prev.baseId === nextBaseId) {
        return prev
      }
      return { ...prev, baseId: nextBaseId }
    })
  }, [formState.base])

  useEffect(() => {
    setInitialServiceErrors({})
    setInitialServiceState((prev) => {
      const currentName = prev.displayName?.trim() ?? ''
      if (currentName) {
        return prev
      }
      return { ...prev, displayName: getServiceTypeLabel(prev.serviceType) }
    })
  }, [])

  useEffect(() => {
    if (!servicePlans || servicePlans.length === 0) {
      return
    }

    setInitialServiceState((prev) => {
      if (prev.servicePlanId) {
        return prev
      }

      const firstActivePlan = servicePlans.find((plan) => plan.isActive)
      if (!firstActivePlan) {
        return prev
      }

      const defaultName = getServiceTypeLabel(prev.serviceType)
      const trimmedName = prev.displayName?.trim() ?? ''
      const hasCustomName = trimmedName && trimmedName !== defaultName
      const hasCustomPrice = prev.price !== '' && prev.price !== null && prev.price !== undefined

      const nextState = {
        ...prev,
        servicePlanId: String(firstActivePlan.id),
        serviceType: firstActivePlan.serviceType ?? prev.serviceType,
      }

      if (!hasCustomName) {
        nextState.displayName = firstActivePlan.name ?? defaultName
      }

      if (!hasCustomPrice) {
        nextState.price =
          firstActivePlan.defaultMonthlyFee === null || firstActivePlan.defaultMonthlyFee === undefined
            ? ''
            : String(firstActivePlan.defaultMonthlyFee)
      }

      return nextState
    })
  }, [servicePlans])

  const selectedClient = useMemo(
    () => {
      if (!selectedClientId) {
        return null
      }
      return clients.find((client) => normalizeId(client.id) === selectedClientId) ?? null
    },
    [clients, selectedClientId],
  )
  const buildDefaultServiceFormState = useCallback(
    () => ({
      displayName: '',
      serviceType: 'other',
      price: '',
      billingDay: '',
      baseId: selectedClient?.base ? String(selectedClient.base) : '',
      notes: '',
    }),
    [selectedClient?.base],
  )
  useEffect(() => {
    setServiceFormState(buildDefaultServiceFormState())
    setServiceFormErrors({})
    if (shouldOpenServiceFormRef.current) {
      setIsAddingService(true)
      shouldOpenServiceFormRef.current = false
    } else {
      setIsAddingService(false)
    }
  }, [buildDefaultServiceFormState, selectedClientId])
  const selectedClientServices = useMemo(
    () => (selectedClient?.services ? [...selectedClient.services] : []),
    [selectedClient],
  )
  const selectedClientRecentPayments = useMemo(
    () => (selectedClient?.recentPayments ? [...selectedClient.recentPayments] : []),
    [selectedClient],
  )
  const primaryService = useMemo(() => getPrimaryService(selectedClient), [selectedClient])
  const primaryServiceStatusValue = primaryService?.status ?? null
  const canActivateSelectedPrimaryService =
    Boolean(primaryService) &&
    primaryServiceStatusValue !== 'active' &&
    primaryServiceStatusValue !== 'cancelled'
  const canSuspendSelectedPrimaryService =
    Boolean(primaryService) && primaryServiceStatusValue === 'active'
  const detailAnchorPeriod = selectedPeriod ?? currentPeriod ?? null
  const selectedClientPaymentStatus = useMemo(() => {
    if (!selectedClient || !detailAnchorPeriod) {
      return null
    }

    const rawDebtMonths = Number(selectedClient.debtMonths ?? 0)
    const rawAheadMonths = Number(selectedClient.paidMonthsAhead ?? 0)

    const hasDebt = Number.isFinite(rawDebtMonths) && rawDebtMonths > FRACTION_EPSILON
    const hasAhead = !hasDebt && Number.isFinite(rawAheadMonths) && rawAheadMonths > FRACTION_EPSILON

    const normalizedDebt = hasDebt ? Math.max(rawDebtMonths, 0) : 0
    const normalizedAhead = hasAhead ? Math.max(rawAheadMonths, 0) : 0

    const debtWhole = Math.floor(normalizedDebt)
    const aheadWhole = Math.floor(normalizedAhead)

    const debtFraction = hasDebt ? Math.abs(normalizedDebt - debtWhole) : 0
    const aheadFraction = hasAhead ? Math.abs(normalizedAhead - aheadWhole) : 0

    const debtHasFraction = debtFraction > FRACTION_EPSILON
    const aheadHasFraction = aheadFraction > FRACTION_EPSILON

    const monthsToSubtract = hasDebt ? debtWhole + (debtHasFraction ? 1 : 0) : 0
    const monthsToAdd = hasAhead ? aheadWhole : 0

    const paidThroughPeriod = hasDebt
      ? addMonthsToPeriod(detailAnchorPeriod, -monthsToSubtract)
      : addMonthsToPeriod(detailAnchorPeriod, monthsToAdd)

    const nextDuePeriod = addMonthsToPeriod(paidThroughPeriod, 1)

    return {
      anchorPeriod: detailAnchorPeriod,
      paidThroughPeriod,
      nextDuePeriod,
      hasDebt,
      hasAhead,
      debtFraction: debtHasFraction ? debtFraction : 0,
      aheadFraction: aheadHasFraction ? aheadFraction : 0,
    }
  }, [selectedClient, detailAnchorPeriod])
  const primaryServiceStatusLabel = useMemo(() => {
    if (primaryService) {
      return formatServiceStatus(primaryService.status)
    }
    return selectedClient?.service ?? 'Sin servicio'
  }, [primaryService, selectedClient?.service])
  const primaryServicePrice = useMemo(() => {
    if (primaryService?.price) {
      const parsed = Number(primaryService.price)
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed
      }
    }
    const parsedClientFee = Number(selectedClient?.monthlyFee)
    return Number.isFinite(parsedClientFee) ? parsedClientFee : CLIENT_PRICE
  }, [primaryService?.price, selectedClient?.monthlyFee])

  useEffect(() => {
    if (!selectedClientId || !selectedClient) {
      return
    }

    const scrollToDetails = () => {
      if (clientDetailsRef.current) {
        clientDetailsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(scrollToDetails)
    } else {
      scrollToDetails()
    }
  }, [selectedClientId, selectedClient])

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
      const monthlyFeeRaw = formState.monthlyFee
      const monthlyFeeValue = Number(monthlyFeeRaw)
      if (
        (typeof monthlyFeeRaw === 'string' && monthlyFeeRaw.trim() === '') ||
        !Number.isFinite(monthlyFeeValue) ||
        monthlyFeeValue < 0
      ) {
        errors.monthlyFee = 'Ingresa un monto mensual válido (cero o mayor).'
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
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const validateServiceForm = useCallback(() => {
    const errors = {}

    const displayName = serviceFormState.displayName?.trim() ?? ''
    if (!displayName) {
      errors.displayName = 'Ingresa el nombre del servicio.'
    }

    if (!serviceFormState.serviceType) {
      errors.serviceType = 'Selecciona el tipo de servicio.'
    }

    if (serviceFormState.price !== '') {
      const parsedPrice = Number(serviceFormState.price)
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        errors.price = 'Ingresa una tarifa mensual válida (cero o mayor).'
      }
    }

    if (serviceFormState.billingDay !== '') {
      const parsedDay = Number(serviceFormState.billingDay)
      if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
        errors.billingDay = 'Indica un día de cobro entre 1 y 31.'
      }
    }

    if (serviceFormState.baseId !== '') {
      const parsedBase = Number(serviceFormState.baseId)
      if (!Number.isInteger(parsedBase) || parsedBase < 1) {
        errors.baseId = 'Selecciona una base válida.'
      }
    }

    setServiceFormErrors(errors)
    return Object.keys(errors).length === 0
  }, [serviceFormState])

  const validateInitialService = useCallback(() => {
    const errors = computeServiceFormErrors(initialServiceState, { requireClientId: false })
    setInitialServiceErrors(errors)
    return Object.keys(errors).length === 0
  }, [initialServiceState])

  const handleSelectInitialPlan = useCallback(
    (planId) => {
      if (!planId || planId === 'custom') {
        setInitialServiceState((prev) => ({ ...prev, servicePlanId: '' }))
        setInitialServiceErrors((prev) => ({ ...prev, servicePlanId: undefined }))
        return
      }

      const selectedPlan = servicePlans.find((plan) => String(plan.id) === planId)
      if (!selectedPlan) {
        setInitialServiceState((prev) => ({ ...prev, servicePlanId: '' }))
        return
      }

      setInitialServiceState((prev) => ({
        ...prev,
        servicePlanId: String(selectedPlan.id),
        serviceType: selectedPlan.serviceType ?? prev.serviceType,
        displayName: selectedPlan.name ?? prev.displayName,
        price:
          selectedPlan.defaultMonthlyFee === null || selectedPlan.defaultMonthlyFee === undefined
            ? ''
            : String(selectedPlan.defaultMonthlyFee),
      }))
      setInitialServiceErrors((prev) => ({ ...prev, servicePlanId: undefined }))
    },
    [servicePlans],
  )

  const handleCancelNewService = useCallback(() => {
    setServiceFormState(buildDefaultServiceFormState())
    setServiceFormErrors({})
    setIsAddingService(false)
  }, [buildDefaultServiceFormState])

  const handleSubmitNewService = useCallback(
    async (event) => {
      event.preventDefault()

      if (!selectedClient || !selectedClient.id) {
        showToast({
          type: 'error',
          title: 'Cliente no disponible',
          description: 'Selecciona un cliente válido para agregar un servicio.',
        })
        return
      }

      if (!validateServiceForm()) {
        return
      }

      const normalizedPrice = (() => {
        if (serviceFormState.price === '' || serviceFormState.price === null) {
          return null
        }
        const parsed = Number(serviceFormState.price)
        return Number.isFinite(parsed) ? parsed : null
      })()

      const normalizedBillingDay = (() => {
        if (serviceFormState.billingDay === '' || serviceFormState.billingDay === null) {
          return null
        }
        const parsed = Number(serviceFormState.billingDay)
        return Number.isInteger(parsed) ? parsed : null
      })()

      const normalizedBaseId = (() => {
        if (serviceFormState.baseId === '' || serviceFormState.baseId === null) {
          return null
        }
        const parsed = Number(serviceFormState.baseId)
        return Number.isInteger(parsed) ? parsed : null
      })()

      try {
        await createClientService({
          clientId: selectedClient.id,
          serviceType: serviceFormState.serviceType,
          displayName: serviceFormState.displayName.trim(),
          price: normalizedPrice,
          billingDay: normalizedBillingDay,
          baseId: normalizedBaseId,
          notes: serviceFormState.notes?.trim() ? serviceFormState.notes.trim() : null,
        })

        showToast({
          type: 'success',
          title: 'Servicio agregado',
          description: `Se agregó ${serviceFormState.displayName.trim()} a ${selectedClient.name}.`,
        })

        setServiceFormState(buildDefaultServiceFormState())
        setServiceFormErrors({})
        setIsAddingService(false)
      } catch (error) {
        showToast({
          type: 'error',
          title: 'No se pudo agregar el servicio',
          description: error?.message ?? 'Intenta nuevamente.',
        })
      }
    },
    [
      selectedClient,
      serviceFormState,
      createClientService,
      showToast,
      validateServiceForm,
      buildDefaultServiceFormState,
    ],
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validateForm()) return
    if (!validateInitialService()) return

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
          ? (() => {
              const rawValue = formState.monthlyFee
              const numericValue = Number(rawValue)
              if (!Number.isFinite(numericValue) || numericValue < 0) {
                return CLIENT_PRICE
              }
              return numericValue
            })()
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

    const clientName = formState.name.trim()
    const initialServiceSnapshot = { ...initialServiceState }

    try {
      const newClient = await createClient(payload)
      showToast({
        type: 'success',
        title: 'Cliente agregado',
        description: `Se agregó a ${clientName} correctamente.`,
      })
      setFormState({ ...defaultForm })
      setFormErrors({})

      const normalizedNewClientId = normalizeId(newClient?.id)
      if (normalizedNewClientId) {
        let shouldOpenServiceForm = true
        const trimmedServiceName = initialServiceSnapshot.displayName?.trim() ?? ''

        if (trimmedServiceName) {
          const normalizedPrice = (() => {
            if (initialServiceSnapshot.price === '' || initialServiceSnapshot.price === null) {
              return null
            }
            const parsed = Number(initialServiceSnapshot.price)
            return Number.isFinite(parsed) ? parsed : null
          })()

          const normalizedBillingDay = (() => {
            if (initialServiceSnapshot.billingDay === '' || initialServiceSnapshot.billingDay === null) {
              return null
            }
            const parsed = Number(initialServiceSnapshot.billingDay)
            return Number.isInteger(parsed) ? parsed : null
          })()

          const normalizedBaseId = (() => {
            if (initialServiceSnapshot.baseId === '' || initialServiceSnapshot.baseId === null) {
              return null
            }
            const parsed = Number(initialServiceSnapshot.baseId)
            return Number.isInteger(parsed) ? parsed : null
          })()

          const servicePayload = {
            clientId: normalizedNewClientId,
            serviceType: initialServiceSnapshot.serviceType,
            displayName: trimmedServiceName,
            price: normalizedPrice,
            billingDay: normalizedBillingDay,
            baseId: normalizedBaseId,
            status: initialServiceSnapshot.status,
            notes:
              initialServiceSnapshot.notes?.trim()
                ? initialServiceSnapshot.notes.trim()
                : null,
          }

          if (initialServiceSnapshot.servicePlanId) {
            const parsedPlanId = Number(initialServiceSnapshot.servicePlanId)
            if (Number.isFinite(parsedPlanId) && parsedPlanId > 0) {
              servicePayload.servicePlanId = parsedPlanId
            }
          }

          try {
            await createClientService(servicePayload)
            showToast({
              type: 'success',
              title: 'Servicio asignado',
              description: `${trimmedServiceName} se registró para ${clientName}.`,
            })
            shouldOpenServiceForm = false
          } catch (error) {
            showToast({
              type: 'warning',
              title: 'Servicio no registrado',
              description:
                error?.message ??
                'Agrega el servicio manualmente desde la ficha del cliente.',
            })
          }
        }

        shouldOpenServiceFormRef.current = shouldOpenServiceForm
        setSelectedClientId(normalizedNewClientId)
        setHighlightedClientId(normalizedNewClientId)
      }
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo agregar el cliente',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    }
  }

  const handleUpdateServiceStatus = async (client, service, nextStatus) => {
    if (!client || !service) {
      showToast({
        type: 'error',
        title: 'Servicio no disponible',
        description: 'Selecciona un cliente y servicio válidos para actualizar.',
      })
      return
    }

    const normalizedStatus = typeof nextStatus === 'string' ? nextStatus.trim().toLowerCase() : ''

    if (normalizedStatus !== 'active' && normalizedStatus !== 'suspended') {
      showToast({
        type: 'error',
        title: 'Estado no soportado',
        description: 'Solo se puede activar o suspender el servicio desde esta vista.',
      })
      return
    }

    if (service.status === normalizedStatus) {
      const currentStatusLabel = formatServiceStatus(service.status)
      showToast({
        type: 'info',
        title: 'Sin cambios',
        description: `${service.name} ya está ${currentStatusLabel.toLowerCase()}.`,
      })
      return
    }

    try {
      await updateClientServiceStatus(client.id, service.id, normalizedStatus)
      const nextStatusLabel = formatServiceStatus(normalizedStatus)
      const toastTitle = normalizedStatus === 'active' ? 'Servicio activado' : 'Servicio suspendido'
      showToast({
        type: 'success',
        title: toastTitle,
        description: `${service.name} para ${client.name} ahora está ${nextStatusLabel.toLowerCase()}.`,
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo actualizar el servicio',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    }
  }

  const handleDeleteClient = async (client) => {
    if (!client || !client.id) {
      showToast({
        type: 'error',
        title: 'Cliente no disponible',
        description: 'Selecciona un cliente válido para eliminar.',
      })
      return
    }

    const confirmationMessage = `¿Eliminar a ${client.name}? Esta acción no se puede deshacer.`
    const isConfirmed = window.confirm(confirmationMessage)

    if (!isConfirmed) {
      return
    }

    const normalizedClientId = normalizeId(client.id)

    try {
      await deleteClient(client.id)
      showToast({
        type: 'success',
        title: 'Cliente eliminado',
        description: `${client.name} se eliminó correctamente.`,
      })

      if (normalizedClientId && selectedClientId === normalizedClientId) {
        setSelectedClientId(null)
      }

      if (normalizedClientId && highlightedClientId === normalizedClientId) {
        setHighlightedClientId(null)
      }
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo eliminar el cliente',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    }
  }

  const isClientsTabActive = activeMainTab === 'clients'

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">Panel operativo de clientes</h1>
          <p className="text-sm text-slate-600">
            Gestiona tus clientes, consulta su estado y administra los servicios mensuales disponibles.
          </p>
        </div>
        <div className="inline-flex w-full flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-slate-100 p-1 md:w-auto">
          {MAIN_TABS.map((tab) => {
            const isActive = activeMainTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectMainTab(tab.id)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  isActive ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'
                }`}
                aria-pressed={isActive}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {isClientsTabActive ? (
        <>
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
            <Button
              type="button"
              className="w-full md:w-auto md:self-center"
              onClick={handleToggleClientForm}
            >
              {isClientFormOpen ? 'Cerrar formulario' : 'Agregar cliente'}
            </Button>
          </div>
        </div>

        {isClientFormOpen ? (
          <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1">
                Tipo de cliente
                <InfoTooltip text="Elige si es un cliente residencial o un punto con antena pública para mostrar los campos correspondientes." />
              </span>
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
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
              >
                {Object.entries(CLIENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1">
                Nombre completo
                <InfoTooltip text="Utiliza el nombre con el que aparece en los contratos o facturación para evitar confusiones." />
              </span>
              <input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                  formErrors.name
                    ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                    : 'border-slate-300'
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
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1">
                Localidad
                <InfoTooltip text="Selecciona la localidad para segmentar reportes y facilitar visitas técnicas." />
              </span>
              <select
                value={formState.location}
                onChange={(event) => setFormState((prev) => ({ ...prev, location: event.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
              >
                {availableLocations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1">
                Base
                <InfoTooltip text="La base determina la red a la que pertenece el cliente y limita las IP disponibles." />
              </span>
              <select
                value={formState.base}
                onChange={(event) => setFormState((prev) => ({ ...prev, base: Number(event.target.value) }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
              >
                <option value={1}>Base 1</option>
                <option value={2}>Base 2</option>
              </select>
            </label>

            {currentIpFields.map(({ name, label, rangeKey }) => (
              <label key={name} className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  {label}
                  <InfoTooltip text={`Selecciona una IP libre para ${label.toLowerCase()}. Solo se muestran las opciones disponibles según la base elegida.`} />
                </span>
                <select
                  value={formState[name] ?? ''}
                  onChange={(event) => setFormState((prev) => ({ ...prev, [name]: event.target.value }))}
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    formErrors[name] ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200' : 'border-slate-300'
                  }`}
                >
                  <option value="">Selecciona una IP disponible</option>
                  {getAvailableIps(rangeKey, formState.base).map((ip) => (
                    <option key={ip} value={ip}>
                      {ip}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-500">
                  Las IP sugeridas respetan el rango asignado a la base seleccionada.
                </span>
                {formErrors[name] && (
                  <span className="text-xs font-medium text-red-600">{formErrors[name]}</span>
                )}
              </label>
            ))}
          </div>

          {formState.type === 'residential' ? (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Pago mensual (MXN)
                  <InfoTooltip text="Registra el monto mensual acordado. Se utiliza para calcular deudas y pagos adelantados." />
                </span>
                <input
                  value={formState.monthlyFee}
                  onChange={(event) => setFormState((prev) => ({ ...prev, monthlyFee: event.target.value }))}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    formErrors.monthlyFee
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  }`}
                />
                <span className="text-xs font-normal text-slate-500">
                  Ingresa 0 para clientes en cortesía o sin cobro mensual.
                </span>
                {formErrors.monthlyFee && (
                  <span className="text-xs font-medium text-red-600">{formErrors.monthlyFee}</span>
                )}
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Periodos pendientes
                  <InfoTooltip text="Introduce los periodos adeudados para llevar un control preciso del saldo." />
                </span>
                <input
                  value={formState.debtMonths}
                  onChange={(event) => setFormState((prev) => ({ ...prev, debtMonths: event.target.value }))}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    formErrors.debtMonths
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  }`}
                />
                {formErrors.debtMonths && (
                  <span className="text-xs font-medium text-red-600">{formErrors.debtMonths}</span>
                )}
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Periodos adelantados
                  <InfoTooltip text="Registra periodos pagados por adelantado para evitar duplicar cargos posteriores." />
                </span>
                <input
                  value={formState.paidMonthsAhead}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, paidMonthsAhead: event.target.value }))
                  }
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    formErrors.paidMonthsAhead
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
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
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Modelo de antena
                  <InfoTooltip text="Selecciona el equipo instalado para facilitar mantenimientos y reposiciones." />
                </span>
                <select
                  value={formState.antennaModel}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, antennaModel: event.target.value }))
                  }
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                >
                  {CLIENT_ANTENNA_MODELS.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Modelo de módem
                  <InfoTooltip text="Describe el módem instalado en el cliente para identificar compatibilidad y garantías." />
                </span>
                <input
                  value={formState.modemModel}
                  onChange={(event) => setFormState((prev) => ({ ...prev, modemModel: event.target.value }))}
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    formErrors.modemModel
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  }`}
                  placeholder="Ej. TP-Link WR840N"
                />
                {formErrors.modemModel && (
                  <span className="text-xs font-medium text-red-600">{formErrors.modemModel}</span>
                )}
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Periodos adelantados
                  <InfoTooltip text="Registra si el punto con antena pública tiene pagos adelantados para ajustar los siguientes cobros." />
                </span>
                <input
                  value={formState.paidMonthsAhead}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, paidMonthsAhead: event.target.value }))
                  }
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    formErrors.paidMonthsAhead
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  }`}
                />
                {formErrors.paidMonthsAhead && (
                  <span className="text-xs font-medium text-red-600">{formErrors.paidMonthsAhead}</span>
                )}
              </label>
            </div>
          )}

          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900">Servicio mensual inicial</h3>
              <p className="text-xs text-slate-600">
                Selecciona el servicio que tendrá el cliente desde su registro. Puedes ajustar los datos más adelante.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1 text-xs font-semibold text-slate-700 md:col-span-3">
                <span className="flex items-center gap-1">
                  Servicio mensual disponible
                  <InfoTooltip text="Selecciona uno de los servicios registrados para rellenar automáticamente los datos. Usa la opción manual para configurar un servicio único." />
                </span>
                <select
                  value={initialServiceState.servicePlanId || ''}
                  onChange={(event) => handleSelectInitialPlan(event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                  disabled={isLoadingServicePlans && servicePlanOptions.length === 0}
                >
                  <option value="">
                    {isLoadingServicePlans ? 'Cargando servicios…' : 'Selecciona un servicio mensual'}
                  </option>
                  {servicePlanOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  <option value="custom">Configurar manualmente</option>
                </select>
                <span className="text-[11px] text-slate-500">
                  Los campos se pueden personalizar después de seleccionar un servicio.
                </span>
                {servicePlansStatus?.error && (
                  <span className="text-xs font-medium text-red-600">
                    {servicePlansStatus.error}
                  </span>
                )}
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Tipo de servicio
                  <InfoTooltip text="Define qué servicio mensual contrata el cliente. Puedes actualizarlo en cualquier momento." />
                </span>
                <select
                  value={initialServiceState.serviceType}
                  onChange={(event) => {
                    const nextType = event.target.value
                    setInitialServiceState((prev) => {
                      const currentName = prev.displayName?.trim() ?? ''
                      const previousDefault = getServiceTypeLabel(prev.serviceType)
                      const nextDefault = getServiceTypeLabel(nextType)
                      const hasCustomName = currentName && currentName !== previousDefault
                      return {
                        ...prev,
                        serviceType: nextType,
                        displayName: hasCustomName ? prev.displayName : nextDefault,
                      }
                    })
                  }}
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    initialServiceErrors.serviceType
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  }`}
                >
                  {SERVICE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {initialServiceErrors.serviceType && (
                  <span className="text-xs font-medium text-red-600">
                    {initialServiceErrors.serviceType}
                  </span>
                )}
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Nombre del servicio
                  <InfoTooltip text="Este nombre aparecerá en los listados de clientes y pagos." />
                </span>
                <input
                  value={initialServiceState.displayName}
                  onChange={(event) =>
                    setInitialServiceState((prev) => ({ ...prev, displayName: event.target.value }))
                  }
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    initialServiceErrors.displayName
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  }`}
                  placeholder="Servicio mensual"
                />
                {initialServiceErrors.displayName && (
                  <span className="text-xs font-medium text-red-600">
                    {initialServiceErrors.displayName}
                  </span>
                )}
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Tarifa mensual (MXN)
                  <InfoTooltip text="Ingresa el monto mensual acordado. Déjalo en blanco si aún no está definido." />
                </span>
                <input
                  value={initialServiceState.price}
                  onChange={(event) =>
                    setInitialServiceState((prev) => ({ ...prev, price: event.target.value }))
                  }
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    initialServiceErrors.price
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  }`}
                />
                {initialServiceErrors.price && (
                  <span className="text-xs font-medium text-red-600">{initialServiceErrors.price}</span>
                )}
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Día de cobro
                  <InfoTooltip text="Define el día del mes en el que se espera el pago de este servicio." />
                </span>
                <input
                  value={initialServiceState.billingDay}
                  onChange={(event) =>
                    setInitialServiceState((prev) => ({ ...prev, billingDay: event.target.value }))
                  }
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="31"
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    initialServiceErrors.billingDay
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  }`}
                  placeholder="Ej. 5"
                />
                {initialServiceErrors.billingDay && (
                  <span className="text-xs font-medium text-red-600">
                    {initialServiceErrors.billingDay}
                  </span>
                )}
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Base del servicio
                  <InfoTooltip text="Puedes asociar el servicio a una base específica o usar la base del cliente." />
                </span>
                <select
                  value={initialServiceState.baseId}
                  onChange={(event) =>
                    setInitialServiceState((prev) => ({ ...prev, baseId: event.target.value }))
                  }
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    initialServiceErrors.baseId
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  }`}
                >
                  <option value="">Usar base del cliente</option>
                  <option value="1">Base 1</option>
                  <option value="2">Base 2</option>
                </select>
                {initialServiceErrors.baseId && (
                  <span className="text-xs font-medium text-red-600">
                    {initialServiceErrors.baseId}
                  </span>
                )}
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Estado
                  <InfoTooltip text="Controla si el servicio inicia activo o suspendido." />
                </span>
                <select
                  value={initialServiceState.status}
                  onChange={(event) =>
                    setInitialServiceState((prev) => ({ ...prev, status: event.target.value }))
                  }
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    initialServiceErrors.status
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  }`}
                >
                  {SERVICE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {initialServiceErrors.status && (
                  <span className="text-xs font-medium text-red-600">
                    {initialServiceErrors.status}
                  </span>
                )}
              </label>
              <label className="md:col-span-3">
                <span className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                  Notas del servicio
                  <InfoTooltip text="Agrega detalles relevantes como velocidad, equipo instalado o particularidades de cobro." />
                </span>
                <textarea
                  value={initialServiceState.notes}
                  onChange={(event) =>
                    setInitialServiceState((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                  placeholder="Ej. Plan de 20 Mbps con renta de router incluida"
                />
              </label>
            </div>
            <p className="text-[11px] text-slate-500">
              ¿Necesitas crear o modificar servicios mensuales?{' '}
              <button
                type="button"
                onClick={() => handleSelectMainTab('services')}
                className="font-semibold text-blue-600 hover:underline"
              >
                Abre la pestaña de servicios mensuales
              </button>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
              onClick={() => {
                setFormState({ ...defaultForm })
                setFormErrors({})
                setInitialServiceState(createInitialServiceState(defaultForm.base))
                setInitialServiceErrors({})
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
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm text-slate-600">
              Presiona "Agregar cliente" cuando necesites registrar un nuevo cliente sin saturar la vista.
            </div>
          )}
        </section>
        <ImportClientsModal
          isOpen={isImportModalOpen}
          onClose={handleCloseImport}
          onSubmit={handleImportClients}
          isProcessing={isImportingClients}
          summary={importSummary}
          requiresConfirmation={requiresImportConfirmation}
          onConfirmSummary={handleConfirmImportSummary}
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
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                    setSortField('name')
                    setSortDirection('asc')
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
                        <th
                          scope="col"
                          className="px-3 py-2 font-medium"
                          aria-sort={
                            sortField === 'name'
                              ? sortDirection === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          <button
                            type="button"
                            onClick={() => handleSort('name')}
                            className="flex items-center gap-1 text-slate-600 transition-colors hover:text-slate-900"
                          >
                            <span>Cliente</span>
                            <span aria-hidden className="text-xs">
                              {sortField === 'name'
                                ? sortDirection === 'asc'
                                  ? '↑'
                                  : '↓'
                                : '↕'}
                            </span>
                            <span className="sr-only">
                              Orden {sortField === 'name'
                                ? sortDirection === 'asc'
                                  ? 'ascendente'
                                  : 'descendente'
                                : 'no aplicado'}. Haz clic para cambiar.
                            </span>
                          </button>
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 font-medium"
                          aria-sort={
                            sortField === 'location'
                              ? sortDirection === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          <button
                            type="button"
                            onClick={() => handleSort('location')}
                            className="flex items-center gap-1 text-slate-600 transition-colors hover:text-slate-900"
                          >
                            <span>Localidad</span>
                            <span aria-hidden className="text-xs">
                              {sortField === 'location'
                                ? sortDirection === 'asc'
                                  ? '↑'
                                  : '↓'
                                : '↕'}
                            </span>
                            <span className="sr-only">
                              Orden {sortField === 'location'
                                ? sortDirection === 'asc'
                                  ? 'ascendente'
                                  : 'descendente'
                                : 'no aplicado'}. Haz clic para cambiar.
                            </span>
                          </button>
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
                      {sortedResidentialClients.map((client, index) => {
                        const clientRowId = normalizeId(client.id)
                        const isActiveRow =
                          clientRowId !== null &&
                          (highlightedClientId === clientRowId || selectedClientId === clientRowId)
                        const rowKey = clientRowId ?? `client-${index}`
                        const rowElementId = `client-${clientRowId ?? client.id ?? index}`
                        const primaryServiceForRow = getPrimaryService(client)
                        const primaryStatusForRow = primaryServiceForRow
                          ? formatServiceStatus(primaryServiceForRow.status)
                          : client.service
                        const primaryServiceStatus = primaryServiceForRow?.status ?? null
                        const isPrimaryActive = primaryServiceStatus === 'active'
                        const canActivatePrimaryService =
                          Boolean(primaryServiceForRow) &&
                          primaryServiceStatus !== 'active' &&
                          primaryServiceStatus !== 'cancelled'
                        const canSuspendPrimaryService =
                          Boolean(primaryServiceForRow) && primaryServiceStatus === 'active'
                        const primaryMonthlyFee = (() => {
                          const parsed = Number(primaryServiceForRow?.price)
                          if (Number.isFinite(parsed) && parsed > 0) {
                            return parsed
                          }
                          const mappedFee = Number(client.monthlyFee)
                          return Number.isFinite(mappedFee) ? mappedFee : CLIENT_PRICE
                        })()

                        return (
                          <tr
                            key={rowKey}
                            id={rowElementId}
                            className={isActiveRow ? 'bg-blue-50/70 transition-colors' : undefined}
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
                                isPrimaryActive
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {primaryStatusForRow}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {peso(primaryMonthlyFee)}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {client.debtMonths > 0 ? (
                              <div className="flex flex-col">
                                <span>
                                  {client.debtMonths}{' '}
                                  {client.debtMonths === 1 ? 'periodo' : 'periodos'}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {peso(client.debtMonths * primaryMonthlyFee)}
                                </span>
                              </div>
                            ) : (
                              'Sin deuda'
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className={ACTION_BUTTON_CLASSES}
                                onClick={() =>
                                  setSelectedClientId((prev) => {
                                    if (!clientRowId) {
                                      return prev
                                    }
                                    return prev === clientRowId ? null : clientRowId
                                  })
                                }
                              >
                                {selectedClientId === clientRowId ? 'Ocultar' : 'Ver detalles'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className={ACTION_BUTTON_CLASSES}
                                onClick={() =>
                                  handleUpdateServiceStatus(client, primaryServiceForRow, 'active')
                                }
                                disabled={isMutatingClients || !canActivatePrimaryService}
                              >
                                Activar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className={ACTION_BUTTON_CLASSES}
                                onClick={() =>
                                  handleUpdateServiceStatus(client, primaryServiceForRow, 'suspended')
                                }
                                disabled={isMutatingClients || !canSuspendPrimaryService}
                              >
                                Suspender
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleDeleteClient(client)}
                                disabled={isMutatingClients}
                              >
                                Eliminar
                              </Button>
                            </div>
                          </td>
                        </tr>
                        )
                      })}
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

      {selectedClient && (
        <section
          ref={clientDetailsRef}
          aria-labelledby="detalles-cliente"
          className="space-y-4"
        >
          <Card>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-1">
                  <h2 id="detalles-cliente" className="text-lg font-semibold text-slate-900">
                    Detalles de {selectedClient.name}
                  </h2>
                  <p className="text-sm text-slate-500">
                    Base {selectedClient.base} · {selectedClient.location}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={ACTION_BUTTON_CLASSES}
                    onClick={() =>
                      handleUpdateServiceStatus(selectedClient, primaryService, 'active')
                    }
                    disabled={isMutatingClients || !canActivateSelectedPrimaryService}
                  >
                    Activar servicio
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={ACTION_BUTTON_CLASSES}
                    onClick={() =>
                      handleUpdateServiceStatus(selectedClient, primaryService, 'suspended')
                    }
                    disabled={isMutatingClients || !canSuspendSelectedPrimaryService}
                  >
                    Suspender servicio
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleDeleteClient(selectedClient)}
                    disabled={isMutatingClients}
                  >
                    Eliminar cliente
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-medium text-slate-500">Estado del servicio</p>
                  <p className="text-base font-semibold text-slate-900">
                    {primaryServiceStatusLabel}
                  </p>
                  {primaryService ? (
                    <p className="text-xs text-slate-500">
                      Servicio principal: {primaryService.name} · {formatServiceType(primaryService.type)}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">Sin servicios registrados.</p>
                  )}
                  {selectedClientPaymentStatus && (
                    <div className="mt-2 space-y-1 text-xs">
                      <p
                        className={
                          selectedClientPaymentStatus.hasDebt
                            ? 'font-medium text-red-600'
                            : 'text-slate-500'
                        }
                      >
                        Pagado hasta{' '}
                        {formatPeriodLabel(selectedClientPaymentStatus.paidThroughPeriod)}.
                      </p>
                      <p
                        className={
                          selectedClientPaymentStatus.hasDebt
                            ? 'font-medium text-red-600'
                            : 'text-slate-500'
                        }
                      >
                        Toca pagar: {formatPeriodLabel(selectedClientPaymentStatus.nextDuePeriod)}.
                      </p>
                      {selectedClientPaymentStatus.hasDebt &&
                        selectedClientPaymentStatus.debtFraction > 0 && (
                          <p className="text-[11px] font-medium text-amber-700">
                            Falta cubrir {formatPeriods(selectedClientPaymentStatus.debtFraction)} periodo
                            parcial de {formatPeriodLabel(selectedClientPaymentStatus.nextDuePeriod)}.
                          </p>
                        )}
                      {selectedClientPaymentStatus.hasAhead &&
                        selectedClientPaymentStatus.aheadFraction > 0 && (
                          <p className="text-[11px] font-medium text-emerald-700">
                            Incluye {formatPeriods(selectedClientPaymentStatus.aheadFraction)} periodo
                            parcial adelantado de {formatPeriodLabel(selectedClientPaymentStatus.nextDuePeriod)}.
                          </p>
                        )}
                      <p className="text-[11px] text-slate-400">
                        Referencia: {formatPeriodLabel(selectedClientPaymentStatus.anchorPeriod)}.
                      </p>
                    </div>
                  )}
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-medium text-slate-500">Tarifa mensual</p>
                  <p className="text-base font-semibold text-slate-900">{peso(primaryServicePrice)}</p>
                  <p className="text-xs text-slate-500">Adelantado: {formatPeriods(selectedClient.paidMonthsAhead)} periodo(s)</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-medium text-slate-500">Deuda acumulada</p>
                  <p className="text-base font-semibold text-slate-900">
                    {selectedClient.debtMonths > 0
                      ? peso(selectedClient.debtMonths * primaryServicePrice)
                      : 'Sin deuda'}
                  </p>
                  {selectedClient.debtMonths > 0 && (
                    <p className="text-xs text-slate-500">
                      {formatPeriods(selectedClient.debtMonths)}{' '}
                      {isApproximatelyOne(selectedClient.debtMonths) ? 'periodo' : 'periodos'} pendientes
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Servicios contratados</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={ACTION_BUTTON_CLASSES}
                    onClick={() => {
                      if (isAddingService) {
                        handleCancelNewService()
                      } else {
                        setServiceFormErrors({})
                        setServiceFormState(buildDefaultServiceFormState())
                        setIsAddingService(true)
                      }
                    }}
                    disabled={isMutatingClients}
                  >
                    {isAddingService ? 'Cerrar formulario' : 'Agregar servicio'}
                  </Button>
                </div>

                {isAddingService && (
                  <form
                    onSubmit={handleSubmitNewService}
                    className="space-y-4 rounded-md border border-dashed border-slate-300 bg-slate-50/80 p-4"
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1 text-xs font-semibold text-slate-700">
                        <span>Nombre del servicio</span>
                        <input
                          value={serviceFormState.displayName}
                          onChange={(event) =>
                            setServiceFormState((prev) => ({
                              ...prev,
                              displayName: event.target.value,
                            }))
                          }
                          className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                            serviceFormErrors.displayName
                              ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                              : 'border-slate-300'
                          }`}
                          placeholder="Nombre del nuevo servicio"
                          autoComplete="off"
                        />
                        {serviceFormErrors.displayName && (
                          <span className="text-xs font-medium text-red-600">
                            {serviceFormErrors.displayName}
                          </span>
                        )}
                      </label>

                      <label className="grid gap-1 text-xs font-semibold text-slate-700">
                        <span>Tipo de servicio</span>
                        <select
                          value={serviceFormState.serviceType}
                          onChange={(event) =>
                            setServiceFormState((prev) => ({
                              ...prev,
                              serviceType: event.target.value,
                            }))
                          }
                          className={`rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                            serviceFormErrors.serviceType
                              ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                              : 'border-slate-300'
                          }`}
                        >
                          {SERVICE_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {serviceFormErrors.serviceType && (
                          <span className="text-xs font-medium text-red-600">
                            {serviceFormErrors.serviceType}
                          </span>
                        )}
                      </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="grid gap-1 text-xs font-semibold text-slate-700">
                        <span>Tarifa mensual (MXN)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={serviceFormState.price}
                          onChange={(event) =>
                            setServiceFormState((prev) => ({
                              ...prev,
                              price: event.target.value,
                            }))
                          }
                          className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                            serviceFormErrors.price
                              ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                              : 'border-slate-300'
                          }`}
                          placeholder="0.00"
                        />
                        <span className="text-[11px] text-slate-500">
                          Puedes dejarlo en 0 si el monto cambia cada mes.
                        </span>
                        {serviceFormErrors.price && (
                          <span className="text-xs font-medium text-red-600">
                            {serviceFormErrors.price}
                          </span>
                        )}
                      </label>

                      <label className="grid gap-1 text-xs font-semibold text-slate-700">
                        <span>Día de cobro (1-31)</span>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={serviceFormState.billingDay}
                          onChange={(event) =>
                            setServiceFormState((prev) => ({
                              ...prev,
                              billingDay: event.target.value,
                            }))
                          }
                          className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                            serviceFormErrors.billingDay
                              ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                              : 'border-slate-300'
                          }`}
                          placeholder="Opcional"
                        />
                        <span className="text-[11px] text-slate-500">
                          Déjalo vacío si la fecha cambia según la contratación.
                        </span>
                        {serviceFormErrors.billingDay && (
                          <span className="text-xs font-medium text-red-600">
                            {serviceFormErrors.billingDay}
                          </span>
                        )}
                      </label>

                      <label className="grid gap-1 text-xs font-semibold text-slate-700">
                        <span>Base (opcional)</span>
                        <select
                          value={serviceFormState.baseId}
                          onChange={(event) =>
                            setServiceFormState((prev) => ({
                              ...prev,
                              baseId: event.target.value,
                            }))
                          }
                          className={`rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                            serviceFormErrors.baseId
                              ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                              : 'border-slate-300'
                          }`}
                        >
                          <option value="">
                            Usar base del cliente {selectedClient?.base ? `(Base ${selectedClient.base})` : ''}
                          </option>
                          <option value="1">Base 1</option>
                          <option value="2">Base 2</option>
                        </select>
                        {serviceFormErrors.baseId && (
                          <span className="text-xs font-medium text-red-600">
                            {serviceFormErrors.baseId}
                          </span>
                        )}
                      </label>
                    </div>

                    <label className="grid gap-1 text-xs font-semibold text-slate-700">
                      <span>Notas (opcional)</span>
                      <textarea
                        value={serviceFormState.notes}
                        onChange={(event) =>
                          setServiceFormState((prev) => ({
                            ...prev,
                            notes: event.target.value,
                          }))
                        }
                        rows={3}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                        placeholder="Detalles adicionales para este servicio"
                      />
                    </label>

                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={ACTION_BUTTON_CLASSES}
                        onClick={handleCancelNewService}
                        disabled={isMutatingClients}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" size="sm" disabled={isMutatingClients}>
                        Guardar servicio
                      </Button>
                    </div>
                  </form>
                )}

                {selectedClientServices.length === 0 ? (
                  <p className="text-sm text-slate-500">Este cliente aún no tiene servicios configurados.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedClientServices.map((service) => {
                      const statusLabel = formatServiceStatus(service.status)
                      const isActive = service.status === 'active'
                      const isCancelled = service.status === 'cancelled'
                      const servicePrice = Number(service.price)
                      const hasPrice = Number.isFinite(servicePrice) && servicePrice > 0
                      const canActivateService = !isCancelled && service.status !== 'active'
                      const canSuspendService = !isCancelled && service.status === 'active'

                      return (
                        <div
                          key={service.id}
                          className="flex h-full flex-col justify-between rounded-md border border-slate-200 bg-white p-4"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{service.name}</p>
                                <p className="text-xs uppercase text-slate-500">
                                  {formatServiceType(service.type)}
                                </p>
                              </div>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  isActive
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : isCancelled
                                      ? 'bg-slate-100 text-slate-500'
                                      : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {statusLabel}
                              </span>
                            </div>
                            <div className="space-y-1 text-xs text-slate-600">
                              {hasPrice ? (
                                <p>Tarifa mensual: {peso(servicePrice)}</p>
                              ) : (
                                <p>Tarifa mensual: monto variable</p>
                              )}
                              {service.nextBillingDate ? (
                                <p>Próximo cobro: {formatDate(service.nextBillingDate)}</p>
                              ) : service.billingDay ? (
                                <p>Cobro recurrente día {service.billingDay}</p>
                              ) : (
                                <p>Fecha de cobro pendiente de configurar</p>
                              )}
                              {service.notes && <p>Notas: {service.notes}</p>}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className={ACTION_BUTTON_CLASSES}
                              onClick={() =>
                                handleUpdateServiceStatus(selectedClient, service, 'active')
                              }
                              disabled={isMutatingClients || !canActivateService}
                            >
                              Activar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className={ACTION_BUTTON_CLASSES}
                              onClick={() =>
                                handleUpdateServiceStatus(selectedClient, service, 'suspended')
                              }
                              disabled={isMutatingClients || !canSuspendService}
                            >
                              Suspender
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-slate-900">Pagos recientes</h3>
                {selectedClientRecentPayments.length ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-medium">
                            Fecha
                          </th>
                          <th scope="col" className="px-3 py-2 font-medium">
                            Servicio
                          </th>
                          <th scope="col" className="px-3 py-2 font-medium">
                            Meses
                          </th>
                          <th scope="col" className="px-3 py-2 font-medium">
                            Monto
                          </th>
                          <th scope="col" className="px-3 py-2 font-medium">
                            Método
                          </th>
                          <th scope="col" className="px-3 py-2 font-medium">
                            Nota
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedClientRecentPayments.map((payment) => (
                          <tr key={payment.id}>
                            <td className="px-3 py-2 text-slate-700">{formatDate(payment.date)}</td>
                            <td className="px-3 py-2 text-slate-700">{payment.serviceName}</td>
                            <td className="px-3 py-2 text-slate-700">
                              {formatPeriods(payment.months)}{' '}
                              {isApproximatelyOne(payment.months) ? 'periodo' : 'periodos'}
                            </td>
                            <td className="px-3 py-2 text-slate-700">{peso(payment.amount)}</td>
                            <td className="px-3 py-2 text-slate-700">{payment.method}</td>
                            <td className="px-3 py-2 text-slate-500">{payment.note || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    No se han registrado pagos recientes para este cliente.
                  </p>
                )}

                {selectedClientRecentPayments[0] && (
                  <p className="text-xs text-slate-500">
                    Último pago registrado el {formatDate(selectedClientRecentPayments[0].date)} por{' '}
                    {peso(selectedClientRecentPayments[0].amount)} para {selectedClientRecentPayments[0].serviceName}.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

        </>
      ) : (
        <MonthlyServicesPage variant="embedded" />
      )}
    </div>
  )
}
