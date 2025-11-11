import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import InfoTooltip from '../components/ui/InfoTooltip.jsx'
import ImportClientsModal from '../components/clients/ImportClientsModal.jsx'
import BulkAssignServicesModal from '../components/clients/BulkAssignServicesModal.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { CLIENT_PRICE, useBackofficeStore } from '../store/useBackofficeStore.js'
import { useClients } from '../hooks/useClients.js'
import { useServicePlans } from '../hooks/useServicePlans.js'
import { useToast } from '../hooks/useToast.js'
import { peso, formatDate, formatPeriodLabel, addMonthsToPeriod } from '../utils/formatters.js'
import { SERVICE_STATUS_OPTIONS, getServiceTypeLabel, getServiceStatusLabel } from '../constants/serviceTypes.js'
import { computeServiceFormErrors } from '../utils/serviceFormValidation.js'
import { isCourtesyPrice, resolveEffectivePriceForFormState } from '../utils/effectivePrice.js'
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

const LOCATION_FILTER_NONE = '__none__'

const MAIN_TABS = [
  { id: 'clients', label: 'Clientes' },
  { id: 'services', label: 'Servicios mensuales' },
]

const CLIENTS_SUB_TABS = [
  { id: 'list', label: 'Listado de clientes' },
  { id: 'create', label: 'Agregar cliente' },
]

const CLIENT_DETAIL_TABS = [
  { id: 'summary', label: 'Resumen' },
  { id: 'services', label: 'Servicios contratados' },
  { id: 'payments', label: 'Pagos' },
  { id: 'history', label: 'Historial / Notas' },
]

const CLIENT_TYPE_LABELS = {
  residential: 'Cliente residencial',
  token: 'Punto con antena pública',
}

const formatServiceStatus = (status) => getServiceStatusLabel(status)

const formatServiceType = (type) => getServiceTypeLabel(type)

const formatServicePlanOptionLabel = (plan) => {
  const fee = Number(plan?.monthlyPrice ?? plan?.defaultMonthlyFee)
  if (Number.isFinite(fee) && fee > 0) {
    return `${plan.name} · ${peso(fee)}`
  }
  return `${plan.name} · Monto variable`
}

const isInternetLikeService = (serviceType) =>
  serviceType === 'internet' || serviceType === 'hotspot'

const getPrimaryService = (client) => {
  const services = Array.isArray(client?.services) ? client.services : []
  if (services.length === 0) {
    return null
  }
  return services.find((service) => isInternetLikeService(service.type)) ?? services[0]
}

const normalizeId = (value) => {
  if (value === null || value === undefined) {
    return null
  }
  return String(value)
}

const resolveApiErrorMessage = (error, fallback = 'Intenta nuevamente.') => {
  if (!error || typeof error !== 'object') {
    return fallback
  }

  const detail =
    error?.response?.data?.detail ??
    error?.data?.detail ??
    error?.detail ??
    error?.response?.data?.message ??
    error?.data?.message

  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim()
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }
        if (item && typeof item === 'object') {
          if (typeof item.msg === 'string' && item.msg.trim()) {
            return item.msg.trim()
          }
          if (typeof item.message === 'string' && item.message.trim()) {
            return item.message.trim()
          }
        }
        return null
      })
      .filter(Boolean)

    if (messages.length > 0) {
      return messages.join(', ')
    }
  }

  if (detail && typeof detail === 'object') {
    if (typeof detail.msg === 'string' && detail.msg.trim()) {
      return detail.msg.trim()
    }
    if (typeof detail.message === 'string' && detail.message.trim()) {
      return detail.message.trim()
    }
  }

  const fallbackMessage = typeof error.message === 'string' ? error.message.trim() : ''
  return fallbackMessage || fallback
}

const createInitialServiceState = (baseId) => ({
  servicePlanId: '',
  displayName: '',
  serviceType: 'internet',
  price: '',
  billingDay: '',
  baseId: baseId ? String(baseId) : '',
  status: 'active',
  notes: '',
  isCustomPriceEnabled: false,
})

const defaultForm = {
  type: 'residential',
  name: '',
  location: '',
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
    bulkAssignClientServices,
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
  const [activeClientsSubTab, setActiveClientsSubTab] = useState('list')
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
  const [activeClientDetailTab, setActiveClientDetailTab] = useState('summary')
  const [isAddingService, setIsAddingService] = useState(false)
  const [initialServiceState, setInitialServiceState] = useState(() =>
    createInitialServiceState(defaultForm.base),
  )
  const [initialServiceErrors, setInitialServiceErrors] = useState({})
  const [serviceFormState, setServiceFormState] = useState({
    servicePlanId: '',
    price: '',
    isCustomPriceEnabled: false,
    billingDay: '',
    baseId: '',
    status: 'active',
    notes: '',
  })
  const [serviceFormErrors, setServiceFormErrors] = useState({})
  const [selectedClientIds, setSelectedClientIds] = useState(() => new Set())
  const [isBulkAssignModalOpen, setIsBulkAssignModalOpen] = useState(false)
  const [isProcessingBulkAssign, setIsProcessingBulkAssign] = useState(false)
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
  const selectedInitialPlan = useMemo(() => {
    if (!initialServiceState.servicePlanId) {
      return null
    }
    return (
      servicePlans.find(
        (plan) => String(plan.id) === String(initialServiceState.servicePlanId),
      ) ?? null
    )
  }, [initialServiceState.servicePlanId, servicePlans])
  const selectedServicePlan = useMemo(() => {
    if (!serviceFormState.servicePlanId) {
      return null
    }
    return (
      servicePlans.find(
        (plan) => String(plan.id) === String(serviceFormState.servicePlanId),
      ) ?? null
    )
  }, [serviceFormState.servicePlanId, servicePlans])
  const initialServiceEffectivePrice = useMemo(
    () => resolveEffectivePriceForFormState(initialServiceState, selectedInitialPlan),
    [initialServiceState, selectedInitialPlan],
  )
  const isInitialCourtesy = useMemo(
    () => isCourtesyPrice(initialServiceEffectivePrice),
    [initialServiceEffectivePrice],
  )
  const serviceFormEffectivePrice = useMemo(
    () => resolveEffectivePriceForFormState(serviceFormState, selectedServicePlan),
    [serviceFormState, selectedServicePlan],
  )
  const isServiceFormCourtesy = useMemo(
    () => isCourtesyPrice(serviceFormEffectivePrice),
    [serviceFormEffectivePrice],
  )
  const planRequiresIp = Boolean(selectedInitialPlan?.requiresIp)
  const planRequiresBase = Boolean(selectedInitialPlan?.requiresBase)
  const planRequiresBillingDay = Boolean(
    planRequiresIp ||
      planRequiresBase ||
      (selectedInitialPlan && isInternetLikeService(selectedInitialPlan.serviceType)),
  )
  const servicePlanRequiresIp = Boolean(selectedServicePlan?.requiresIp)
  const servicePlanRequiresBase = Boolean(selectedServicePlan?.requiresBase)
  const servicePlanRequiresBillingDay = Boolean(
    servicePlanRequiresIp ||
      servicePlanRequiresBase ||
      (selectedServicePlan && isInternetLikeService(selectedServicePlan.serviceType)),
  )
  const shouldRequireInitialBillingDay = planRequiresBillingDay && !isInitialCourtesy
  const shouldRequireServiceBillingDay =
    servicePlanRequiresBillingDay && !isServiceFormCourtesy
  const selectAllCheckboxRef = useRef(null)
  const shouldOpenServiceFormRef = useRef(false)
  const lastScrolledClientRef = useRef(null)
  const isMutatingClients = Boolean(clientsStatus?.isMutating)
  const isSyncingClients = Boolean(clientsStatus?.isLoading)
  const isLoadingClients = Boolean(clientsStatus?.isLoading && clients.length === 0)
  const hasClientsError = Boolean(clientsStatus?.error)
  const shouldShowSkeleton = Boolean(initializeStatus?.isLoading) || isRefreshing

  useEffect(() => {
    if (!location?.hash) {
      setHighlightedClientId(null)
      lastScrolledClientRef.current = null
      return
    }

    if (!location.hash.startsWith('#client-')) {
      setHighlightedClientId(null)
      lastScrolledClientRef.current = null
      return
    }

    const clientId = location.hash.slice('#client-'.length)
    const normalizedClientId = normalizeId(clientId)
    if (!normalizedClientId) {
      setHighlightedClientId(null)
      lastScrolledClientRef.current = null
      return
    }

    const exists = clients.some((client) => normalizeId(client.id) === normalizedClientId)
    if (!exists) {
      setHighlightedClientId(null)
      lastScrolledClientRef.current = null
      return
    }

    setHighlightedClientId(normalizedClientId)

    if (lastScrolledClientRef.current !== normalizedClientId) {
      const row = document.getElementById(`client-${normalizedClientId}`)
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' })
        lastScrolledClientRef.current = normalizedClientId
      }
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
        description: resolveApiErrorMessage(error, 'Intenta nuevamente.'),
      })
    } finally {
      setIsRetrying(false)
    }
  }

  const handleSelectMainTab = useCallback(
    (tabId) => {
      setActiveMainTab(tabId)
      if (tabId !== 'clients') {
        setActiveClientsSubTab('list')
      }
    },
    [],
  )

  const handleSelectClientsSubTab = useCallback((tabId) => {
    setActiveClientsSubTab(tabId)
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
        description: resolveApiErrorMessage(error, 'Intenta nuevamente.'),
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
    clients.forEach((client) => {
      if (client.location) {
        unique.add(client.location)
      }
    })
    return Array.from(unique)
  }, [clients])

  const hasLocationlessClients = useMemo(
    () => clients.some((client) => !client.location),
    [clients],
  )

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

      if (locationFilter === LOCATION_FILTER_NONE) {
        const normalizedLocation =
          typeof client.location === 'string' ? client.location.trim() : ''
        if (normalizedLocation) return false
      } else if (locationFilter !== 'all' && client.location !== locationFilter) {
        return false
      }

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

  useEffect(() => {
    setSelectedClientIds((prev) => {
      if (prev.size === 0) {
        return prev
      }
      const next = new Set()
      clients.forEach((client) => {
        const id = normalizeId(client.id)
        if (id && prev.has(id)) {
          next.add(id)
        }
      })
      return next.size === prev.size ? prev : next
    })
  }, [clients])

  const selectedClientsForBulk = useMemo(
    () =>
      clients.filter((client) => {
        const id = normalizeId(client.id)
        return id && selectedClientIds.has(id)
      }),
    [clients, selectedClientIds],
  )

  const selectedClientsCount = selectedClientsForBulk.length
  const hasSelectedClients = selectedClientsCount > 0
  const isSingleSelection = selectedClientsCount === 1
  const isMultiSelection = selectedClientsCount > 1

  const handleOpenBulkAssign = useCallback(() => {
    if (selectedClientsCount === 0) {
      showToast({
        type: 'info',
        title: 'Selecciona clientes',
        description: 'Elige uno o más clientes desde el listado para editar servicios.',
      })
      return
    }

    if (selectedClientsCount === 1) {
      showToast({
        type: 'info',
        title: 'Selecciona más clientes',
        description: 'Elige al menos dos clientes para aplicar cambios masivos.',
      })
      return
    }

    setIsBulkAssignModalOpen(true)
  }, [selectedClientsCount, showToast])

  const handleCloseClientPanel = useCallback(() => {
    setSelectedClientId(null)
    setActiveClientDetailTab('summary')
  }, [])

  const handleViewSelectedClientInfo = useCallback(() => {
    if (!isSingleSelection || selectedClientsForBulk.length === 0) {
      showToast({
        type: 'info',
        title: 'Selecciona un cliente',
        description: 'Elige un solo cliente para revisar su información detallada.',
      })
      return
    }
    const normalizedId = normalizeId(selectedClientsForBulk[0]?.id)
    if (!normalizedId) {
      return
    }
    setActiveClientDetailTab('summary')
    setSelectedClientId(normalizedId)
  }, [isSingleSelection, selectedClientsForBulk, showToast])

  const handleEditSelectedClientServices = useCallback(() => {
    if (!isSingleSelection || selectedClientsForBulk.length === 0) {
      showToast({
        type: 'info',
        title: 'Selecciona un cliente',
        description: 'Elige un solo cliente para editar sus servicios.',
      })
      return
    }
    const normalizedId = normalizeId(selectedClientsForBulk[0]?.id)
    if (!normalizedId) {
      return
    }
    setActiveClientDetailTab('services')
    setSelectedClientId(normalizedId)
  }, [isSingleSelection, selectedClientsForBulk, showToast])

  const handleToggleClientDetails = useCallback((clientId) => {
    const normalizedId = normalizeId(clientId)
    if (!normalizedId) {
      return
    }
    setActiveClientDetailTab('summary')
    setSelectedClientId((prev) => (prev === normalizedId ? null : normalizedId))
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelectedClientIds(new Set())
    handleCloseClientPanel()
  }, [handleCloseClientPanel])

  const handleCloseBulkAssign = useCallback(() => {
    if (isProcessingBulkAssign) {
      return
    }
    setIsBulkAssignModalOpen(false)
  }, [isProcessingBulkAssign])

  const handleBulkAssignSubmit = useCallback(
    async (values) => {
      if (selectedClientsForBulk.length === 0) {
        showToast({
          type: 'error',
          title: 'Sin clientes seleccionados',
          description: 'Elige al menos un cliente antes de aplicar cambios.',
        })
        return
      }

      try {
        setIsProcessingBulkAssign(true)
        await bulkAssignClientServices({
          ...values,
          clientIds: selectedClientsForBulk
            .map((client) => normalizeId(client.id))
            .filter(Boolean),
        })
        showToast({
          type: 'success',
          title: 'Cambios aplicados',
          description: 'Se actualizaron los servicios seleccionados correctamente.',
        })
        setIsBulkAssignModalOpen(false)
        setSelectedClientIds(new Set())
      } catch (error) {
        const detail =
          error?.response?.data?.detail ??
          error?.data?.detail ??
          error?.detail ??
          null
        const failedClientsRaw = Array.isArray(detail?.failed_clients)
          ? detail.failed_clients
          : Array.isArray(detail?.failedClients)
            ? detail.failedClients
            : []
        const failedClientNames = failedClientsRaw
          .map((item) => {
            if (!item) return null
            if (typeof item === 'string') return item
            if (typeof item.name === 'string' && item.name.trim()) {
              return item.name.trim()
            }
            if (typeof item.full_name === 'string' && item.full_name.trim()) {
              return item.full_name.trim()
            }
            if (typeof item.clientName === 'string' && item.clientName.trim()) {
              return item.clientName.trim()
            }
            if (typeof item.id === 'string' && item.id.trim()) {
              return `ID ${item.id.trim()}`
            }
            return null
          })
          .filter(Boolean)
        const availableSlotsRaw =
          detail &&
          (detail.available_slots ?? detail.availableSlots ?? detail.availableCapacity ?? null)
        let availableSlots = null
        if (availableSlotsRaw !== null && availableSlotsRaw !== undefined) {
          const parsedSlots = Number(availableSlotsRaw)
          if (Number.isFinite(parsedSlots)) {
            availableSlots = parsedSlots
          }
        }
        const baseMessage = resolveApiErrorMessage(error, 'Intenta nuevamente.')
        const extraMessages = []
        if (failedClientNames.length > 0) {
          extraMessages.push(`Sin cambios para: ${failedClientNames.join(', ')}.`)
        }
        if (availableSlots !== null) {
          const slotLabel = availableSlots === 1 ? 'cupo disponible' : 'cupos disponibles'
          extraMessages.push(`Quedan ${availableSlots} ${slotLabel}.`)
        }
        showToast({
          type: 'error',
          title: 'No se pudieron aplicar los cambios',
          description: [baseMessage, ...extraMessages].filter(Boolean).join(' '),
        })
      } finally {
        setIsProcessingBulkAssign(false)
      }
    },
    [bulkAssignClientServices, selectedClientsForBulk, showToast],
  )

  const allFilteredSelected = useMemo(() => {
    if (filteredResidentialClients.length === 0) {
      return false
    }
    return filteredResidentialClients.every((client) => {
      const id = normalizeId(client.id)
      return id ? selectedClientIds.has(id) : false
    })
  }, [filteredResidentialClients, selectedClientIds])

  useEffect(() => {
    if (!selectAllCheckboxRef.current) {
      return
    }
    const checkbox = selectAllCheckboxRef.current
    checkbox.indeterminate = selectedClientsCount > 0 && !allFilteredSelected
  }, [allFilteredSelected, selectedClientsCount])

  const handleToggleClientSelection = useCallback(
    (clientId) => {
      const normalizedId = normalizeId(clientId)
      if (!normalizedId) {
        return
      }
      setSelectedClientIds((prev) => {
        const next = new Set(prev)
        if (next.has(normalizedId)) {
          next.delete(normalizedId)
          if (normalizedId === selectedClientId) {
            handleCloseClientPanel()
          }
        } else {
          next.add(normalizedId)
        }
        return next
      })
    },
    [handleCloseClientPanel, selectedClientId],
  )

  const handleSelectAllFiltered = useCallback(
    (checked) => {
      setSelectedClientIds((prev) => {
        const next = new Set(prev)
        if (checked) {
          filteredResidentialClients.forEach((client) => {
            const id = normalizeId(client.id)
            if (id) {
              next.add(id)
            }
          })
        } else {
          filteredResidentialClients.forEach((client) => {
            const id = normalizeId(client.id)
            if (id) {
              next.delete(id)
            }
          })
        }
        if (selectedClientId && !next.has(selectedClientId)) {
          handleCloseClientPanel()
        }
        return next
      })
    },
    [filteredResidentialClients, handleCloseClientPanel, selectedClientId],
  )

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
      handleCloseClientPanel()
    }
  }, [clients, handleCloseClientPanel, selectedClientId])

  useEffect(() => {
    if (!planRequiresBase) {
      setInitialServiceState((prev) => {
        if (!prev.baseId) {
          return prev
        }
        return { ...prev, baseId: '' }
      })
      return
    }

    const baseValue = Number(formState.base)
    const nextBaseId = Number.isFinite(baseValue) ? String(baseValue) : ''
    setInitialServiceState((prev) => {
      if (prev.baseId === nextBaseId) {
        return prev
      }
      return { ...prev, baseId: nextBaseId }
    })
  }, [formState.base, planRequiresBase])

  useEffect(() => {
    if (!isInitialCourtesy) {
      return
    }

    setFormState((prev) => {
      if (
        Number(prev.debtMonths) === 0 &&
        Number(prev.paidMonthsAhead) === 0
      ) {
        return prev
      }
      return {
        ...prev,
        debtMonths: 0,
        paidMonthsAhead: 0,
      }
    })

    setInitialServiceState((prev) => {
      if (prev.billingDay === '' || prev.billingDay === null) {
        return prev
      }
      return { ...prev, billingDay: '' }
    })
  }, [isInitialCourtesy])

  useEffect(() => {
    if (!isServiceFormCourtesy) {
      return
    }

    setServiceFormState((prev) => {
      if (prev.billingDay === '' || prev.billingDay === null) {
        return prev
      }
      return { ...prev, billingDay: '' }
    })
  }, [isServiceFormCourtesy])

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
    setActiveClientDetailTab('summary')
  }, [selectedClientId])

  useEffect(() => {
    if (activeClientsSubTab === 'create') {
      setFormErrors({})
    }
  }, [activeClientsSubTab])

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
      const hasCustomPrice = Boolean(prev.isCustomPriceEnabled)

      const nextState = {
        ...prev,
        servicePlanId: String(firstActivePlan.id),
        serviceType: firstActivePlan.serviceType ?? prev.serviceType,
        isCustomPriceEnabled: hasCustomPrice,
      }

      if (!hasCustomName) {
        nextState.displayName = firstActivePlan.name ?? defaultName
      }

      if (!hasCustomPrice) {
        nextState.price =
          firstActivePlan.defaultMonthlyFee === null || firstActivePlan.defaultMonthlyFee === undefined
            ? ''
            : String(firstActivePlan.defaultMonthlyFee)
        setFormState((current) => ({ ...current, monthlyFee: nextState.price }))
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
  const isClientPanelOpen = Boolean(selectedClientId && selectedClient)
  const isSelectedClientCourtesy = Boolean(selectedClient?.isCourtesyService)
  const buildDefaultServiceFormState = useCallback(
    () => ({
      servicePlanId: '',
      price: '',
      isCustomPriceEnabled: false,
      billingDay: '',
      baseId: selectedClient?.base ? String(selectedClient.base) : '',
      status: 'active',
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
    if (!selectedClient || !detailAnchorPeriod || isSelectedClientCourtesy) {
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
  }, [selectedClient, detailAnchorPeriod, isSelectedClientCourtesy])
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

  const validateForm = () => {
    const errors = {}
    if (!formState.name.trim()) errors.name = 'El nombre es obligatorio.'
    const requiresLocation = Boolean(
      planRequiresBase ||
        planRequiresIp ||
        (selectedInitialPlan && isInternetLikeService(selectedInitialPlan.serviceType)),
    )
    if (requiresLocation) {
      const locationValue =
        typeof formState.location === 'string' ? formState.location.trim() : ''
      if (!locationValue) {
        errors.location = 'Selecciona la localidad del cliente.'
      }
    }
    const ipFields = planRequiresIp ? CLIENT_IP_FIELDS_BY_TYPE[formState.type] ?? [] : []
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
      if (!isInitialCourtesy) {
        if (!Number.isInteger(Number(formState.debtMonths)) || Number(formState.debtMonths) < 0) {
          errors.debtMonths = 'Los periodos pendientes no pueden ser negativos.'
        }
        if (
          !Number.isInteger(Number(formState.paidMonthsAhead)) ||
          Number(formState.paidMonthsAhead) < 0
        ) {
          errors.paidMonthsAhead = 'Los periodos adelantados no pueden ser negativos.'
        }
      }
    } else {
      if (!formState.modemModel.trim()) {
        errors.modemModel = 'Describe el módem instalado en el cliente.'
      }
    }
    if (!isInitialCourtesy) {
      const debtValue = Number(formState.debtMonths)
      if (!Number.isFinite(debtValue) || debtValue < 0) {
        errors.debtMonths = 'Los periodos pendientes no pueden ser negativos.'
      }
      const aheadValue = Number(formState.paidMonthsAhead)
      if (!Number.isFinite(aheadValue) || aheadValue < 0) {
        errors.paidMonthsAhead = 'Los periodos adelantados no pueden ser negativos.'
      }
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const validateServiceForm = useCallback(() => {
    const errors = computeServiceFormErrors(
      {
        ...serviceFormState,
        price: serviceFormState.isCustomPriceEnabled ? serviceFormState.price : '',
      },
      { plan: selectedServicePlan, effectivePrice: serviceFormEffectivePrice },
    )

    setServiceFormErrors(errors)
    return Object.keys(errors).length === 0
  }, [serviceFormState, selectedServicePlan, serviceFormEffectivePrice])

  const validateInitialService = useCallback(() => {
    const computedErrors = computeServiceFormErrors(
      {
        ...initialServiceState,
        price: initialServiceState.isCustomPriceEnabled ? initialServiceState.price : '',
      },
      {
        requireClientId: false,
        plan: selectedInitialPlan,
        effectivePrice: initialServiceEffectivePrice,
      },
    )

    setInitialServiceErrors(computedErrors)
    return Object.keys(computedErrors).length === 0
  }, [initialServiceState, selectedInitialPlan, initialServiceEffectivePrice])

  const handleSelectInitialPlan = useCallback(
    (planId) => {
      if (!planId) {
        setInitialServiceState((prev) => ({
          ...prev,
          servicePlanId: '',
          isCustomPriceEnabled: false,
        }))
        setInitialServiceErrors((prev) => ({ ...prev, servicePlanId: 'Selecciona un servicio mensual.' }))
        return
      }

      const foundPlan = servicePlans.find((plan) => String(plan.id) === String(planId))
      if (!foundPlan) {
        setInitialServiceState((prev) => ({
          ...prev,
          servicePlanId: '',
          isCustomPriceEnabled: false,
        }))
        setInitialServiceErrors((prev) => ({ ...prev, servicePlanId: 'Selecciona un servicio mensual.' }))
        return
      }

      const defaultPrice =
        foundPlan.defaultMonthlyFee === null || foundPlan.defaultMonthlyFee === undefined
          ? ''
          : String(foundPlan.defaultMonthlyFee)

      const clearedIpFields = new Set()
      const planRequiresLocation = Boolean(
        foundPlan.requiresIp ||
          foundPlan.requiresBase ||
          isInternetLikeService(foundPlan.serviceType),
      )

      setInitialServiceState((prev) => ({
        ...prev,
        servicePlanId: String(foundPlan.id),
        serviceType: foundPlan.serviceType ?? prev.serviceType,
        displayName: foundPlan.name ?? getServiceTypeLabel(foundPlan.serviceType ?? prev.serviceType),
        price: defaultPrice,
        isCustomPriceEnabled: false,
      }))

      setFormState((prev) => ({
        ...prev,
        monthlyFee: defaultPrice,
        ...(foundPlan.requiresIp
          ? {}
          : (() => {
              const clientIpFields = CLIENT_IP_FIELDS_BY_TYPE[prev.type] ?? []
              const cleared = {}
              clientIpFields.forEach(({ name }) => {
                cleared[name] = ''
                clearedIpFields.add(name)
              })
              return cleared
            })()),
      }))

      const fieldsToClear = new Set(clearedIpFields)
      if (!planRequiresLocation) {
        fieldsToClear.add('location')
      }

      if (fieldsToClear.size > 0) {
        setFormErrors((prev) => {
          if (!prev || typeof prev !== 'object') {
            return prev
          }
          const next = { ...prev }
          fieldsToClear.forEach((field) => {
            delete next[field]
          })
          return next
        })
      }

      setInitialServiceErrors({})
    },
    [servicePlans],
  )

  const handleSelectServicePlan = useCallback(
    (planId) => {
      if (!planId) {
        setServiceFormState((prev) => ({
          ...prev,
          servicePlanId: '',
          isCustomPriceEnabled: false,
          price: '',
        }))
        setServiceFormErrors((prev) => ({ ...prev, servicePlanId: 'Selecciona un servicio mensual.' }))
        return
      }

      const foundPlan = servicePlans.find((plan) => String(plan.id) === String(planId))
      if (!foundPlan) {
        setServiceFormState((prev) => ({
          ...prev,
          servicePlanId: '',
          isCustomPriceEnabled: false,
          price: '',
        }))
        setServiceFormErrors((prev) => ({ ...prev, servicePlanId: 'Selecciona un servicio mensual.' }))
        return
      }

      const defaultPrice =
        foundPlan.defaultMonthlyFee === null || foundPlan.defaultMonthlyFee === undefined
          ? ''
          : String(foundPlan.defaultMonthlyFee)

      setServiceFormState((prev) => ({
        ...prev,
        servicePlanId: String(foundPlan.id),
        isCustomPriceEnabled: false,
        price: defaultPrice,
        status: 'active',
        baseId: foundPlan.requiresBase
          ? selectedClient?.base
            ? String(selectedClient.base)
            : prev.baseId
          : prev.baseId,
      }))

      setServiceFormErrors((prev) => {
        if (!prev || typeof prev !== 'object') {
          return {}
        }
        const next = { ...prev }
        delete next.servicePlanId
        delete next.price
        delete next.baseId
        delete next.billingDay
        return next
      })
    },
    [selectedClient?.base, servicePlans],
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
        if (!serviceFormState.isCustomPriceEnabled) {
          return null
        }
        if (serviceFormState.price === '' || serviceFormState.price === null) {
          return null
        }
        const parsed = Number(serviceFormState.price)
        return Number.isFinite(parsed) ? parsed : null
      })()

      const normalizedBillingDay = (() => {
        if (isServiceFormCourtesy) {
          return null
        }
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

      const parsedPlanId = Number(serviceFormState.servicePlanId)
      if (!Number.isFinite(parsedPlanId) || parsedPlanId <= 0) {
        showToast({
          type: 'error',
          title: 'Servicio mensual inválido',
          description: 'Selecciona un servicio mensual válido antes de continuar.',
        })
        return
      }

      try {
        await createClientService({
          clientId: selectedClient.id,
          servicePlanId: parsedPlanId,
          customPrice: normalizedPrice,
          billingDay: normalizedBillingDay,
          baseId: normalizedBaseId,
          status: serviceFormState.status || 'active',
          notes: serviceFormState.notes?.trim() ? serviceFormState.notes.trim() : null,
        })

        showToast({
          type: 'success',
          title: 'Servicio agregado',
          description: `Se agregó ${selectedServicePlan?.name ?? 'el servicio seleccionado'} a ${selectedClient.name}.`,
        })

        setServiceFormState(buildDefaultServiceFormState())
        setServiceFormErrors({})
        setIsAddingService(false)
      } catch (error) {
        showToast({
          type: 'error',
          title: 'No se pudo agregar el servicio',
          description: resolveApiErrorMessage(error, 'Intenta nuevamente.'),
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
      selectedServicePlan,
      isServiceFormCourtesy,
    ],
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validateForm()) return
    if (!validateInitialService()) return

    const normalizedPlanPrice = (() => {
      if (Number.isFinite(initialServiceEffectivePrice)) {
        return Number(initialServiceEffectivePrice)
      }
      const rawPrice = initialServiceSnapshot.price
      if (rawPrice === '' || rawPrice === null || rawPrice === undefined) {
        const planFee = selectedInitialPlan?.defaultMonthlyFee
        const numericPlanFee = Number(planFee)
        return Number.isFinite(numericPlanFee) ? numericPlanFee : null
      }
      const parsed = Number(rawPrice)
      if (Number.isFinite(parsed)) {
        return parsed
      }
      const planFee = selectedInitialPlan?.defaultMonthlyFee
      const numericPlanFee = Number(planFee)
      return Number.isFinite(numericPlanFee) ? numericPlanFee : null
    })()

    const payload = {
      type: formState.type,
      name: formState.name.trim(),
      location: formState.location,
      base: Number(formState.base) || 1,
      debtMonths:
        formState.type === 'residential' && !isInitialCourtesy
          ? Number(formState.debtMonths) || 0
          : 0,
      paidMonthsAhead:
        formState.type === 'residential' && !isInitialCourtesy
          ? Number(formState.paidMonthsAhead) || 0
          : 0,
      monthlyFee:
        formState.type === 'residential'
          ? normalizedPlanPrice ?? 0
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
        const trimmedServiceName =
          initialServiceSnapshot.displayName?.trim() ?? selectedInitialPlan?.name ?? ''

        const parsedInitialPlanId = Number(initialServiceSnapshot.servicePlanId)

        if (Number.isFinite(parsedInitialPlanId) && parsedInitialPlanId > 0) {
          const normalizedPrice =
            initialServiceSnapshot.isCustomPriceEnabled &&
            normalizedPlanPrice !== null &&
            normalizedPlanPrice !== undefined
              ? normalizedPlanPrice
              : null

          const normalizedBillingDay = (() => {
            if (isInitialCourtesy) {
              return null
            }
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
            servicePlanId: parsedInitialPlanId,
            billingDay: normalizedBillingDay,
            baseId: normalizedBaseId,
            status: initialServiceSnapshot.status,
            notes:
              initialServiceSnapshot.notes?.trim()
                ? initialServiceSnapshot.notes.trim()
                : null,
          }

          if (normalizedPrice !== null) {
            servicePayload.customPrice = normalizedPrice
          }

          try {
            await createClientService(servicePayload)
            showToast({
              type: 'success',
              title: 'Servicio asignado',
              description: `${trimmedServiceName || 'Servicio seleccionado'} se registró para ${clientName}.`,
            })
            shouldOpenServiceForm = false
          } catch (error) {
            showToast({
              type: 'warning',
              title: 'Servicio no registrado',
              description: resolveApiErrorMessage(
                error,
                'Agrega el servicio manualmente desde la ficha del cliente.',
              ),
            })
          }
        }

        shouldOpenServiceFormRef.current = shouldOpenServiceForm
        setActiveClientDetailTab('summary')
        setSelectedClientId(normalizedNewClientId)
        setHighlightedClientId(normalizedNewClientId)
      }
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo agregar el cliente',
        description: resolveApiErrorMessage(error, 'Intenta nuevamente.'),
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
        description: resolveApiErrorMessage(error, 'Intenta nuevamente.'),
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
        handleCloseClientPanel()
      }

      if (normalizedClientId && highlightedClientId === normalizedClientId) {
        setHighlightedClientId(null)
      }
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo eliminar el cliente',
        description: resolveApiErrorMessage(error, 'Intenta nuevamente.'),
      })
    }
  }

  const handleDeleteSelectedClient = useCallback(() => {
    if (selectedClientsForBulk.length === 0) {
      showToast({
        type: 'info',
        title: 'Selecciona clientes',
        description: 'Elige al menos un cliente antes de eliminar.',
      })
      return
    }

    if (!isSingleSelection) {
      showToast({
        type: 'info',
        title: 'Eliminación individual',
        description: 'Elimina a los clientes uno por uno para evitar errores.',
      })
      return
    }

    const [clientToDelete] = selectedClientsForBulk
    if (clientToDelete) {
      handleDeleteClient(clientToDelete)
    }
  }, [handleDeleteClient, isSingleSelection, selectedClientsForBulk, showToast])

  const isClientsTabActive = activeMainTab === 'clients'

  if (shouldShowSkeleton) {
    return <ClientsSkeleton />
  }

  return (
    <div className={`space-y-8 ${hasSelectedClients ? 'pb-24' : ''}`}>
      {hasSelectedClients ? (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="w-full max-w-5xl rounded-2xl border border-blue-200 bg-white/95 p-4 shadow-lg backdrop-blur">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-slate-900">
                  {selectedClientsCount === 1
                    ? '1 cliente seleccionado'
                    : `${selectedClientsCount} clientes seleccionados`}
                </p>
                <p className="text-xs text-slate-600">
                  {isSingleSelection
                    ? 'Elige una acción para revisar o actualizar los datos del cliente.'
                    : 'Aplica cambios masivos para sincronizar servicios, estado o base asignada.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleViewSelectedClientInfo}
                  disabled={!isSingleSelection}
                >
                  Ver información
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleEditSelectedClientServices}
                  disabled={!isSingleSelection}
                >
                  Editar servicio
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleOpenBulkAssign}
                  disabled={!isMultiSelection || isProcessingBulkAssign}
                >
                  {isProcessingBulkAssign
                    ? 'Preparando…'
                    : `Aplicar cambios masivos${isMultiSelection ? ` (${selectedClientsCount})` : ''}`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={handleDeleteSelectedClient}
                  disabled={!isSingleSelection || isMutatingClients}
                >
                  Eliminar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleClearSelection}
                  className="border border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-100"
                >
                  Limpiar selección
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
          <section aria-labelledby="gestion-clientes" className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 id="gestion-clientes" className="text-lg font-semibold text-slate-900">
                  Gestión de clientes
                </h2>
                <p className="text-sm text-slate-500">
                  Administra el alta de nuevos registros, revisa el listado actual y aplica acciones masivas cuando lo necesites.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleOpenBulkAssign}
                  className="w-full md:w-auto md:self-center"
                  disabled={!isMultiSelection}
                >
                  {isMultiSelection
                    ? `Aplicar cambios masivos (${selectedClientsCount})`
                    : 'Acciones masivas'}
                </Button>
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

            <div className="inline-flex w-full flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-slate-100 p-1 md:w-auto">
              {CLIENTS_SUB_TABS.map((tab) => {
                const isActive = activeClientsSubTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleSelectClientsSubTab(tab.id)}
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

        {activeClientsSubTab === 'create' ? (
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

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1">
                Localidad
                <InfoTooltip text="Selecciona la localidad para segmentar reportes y facilitar visitas técnicas." />
              </span>
              <select
                value={formState.location}
                onChange={(event) => setFormState((prev) => ({ ...prev, location: event.target.value }))}
                className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                  formErrors.location
                    ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                    : 'border-slate-300'
                }`}
              >
                <option value="">Selecciona una localidad</option>
                {availableLocations
                  .filter((location) => Boolean(location))
                  .map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
              </select>
              {formErrors.location && (
                <span className="text-xs font-medium text-red-600">{formErrors.location}</span>
              )}
            </label>
          </div>

          {formState.type === 'residential' ? (
            <div className="grid gap-4 md:grid-cols-2">
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
                  } ${isInitialCourtesy ? 'bg-slate-100 text-slate-500' : ''}`}
                  disabled={isInitialCourtesy}
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
                  } ${isInitialCourtesy ? 'bg-slate-100 text-slate-500' : ''}`}
                  disabled={isInitialCourtesy}
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
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-700 md:col-span-2">
                <span className="flex items-center gap-1">
                  Servicio mensual disponible
                  <InfoTooltip text="Selecciona un servicio mensual existente para reutilizar sus datos definidos en el catálogo." />
                </span>
                <select
                  value={initialServiceState.servicePlanId || ''}
                  onChange={(event) => handleSelectInitialPlan(event.target.value)}
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    initialServiceErrors.servicePlanId
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  }`}
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
                </select>
                <span className="text-[11px] text-slate-500">
                  Los servicios se administran desde la pestaña "Servicios mensuales".
                </span>
                {servicePlansStatus?.error && (
                  <span className="text-xs font-medium text-red-600">
                    {servicePlansStatus.error}
                  </span>
                )}
              </label>

              {selectedInitialPlan ? (
                <div className="md:col-span-2 space-y-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-700">Plan seleccionado:</span> {selectedInitialPlan.name}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Tipo de servicio:</span>{' '}
                    {getServiceTypeLabel(selectedInitialPlan.serviceType ?? 'internet')}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Tarifa mensual:</span>{' '}
                    {selectedInitialPlan.defaultMonthlyFee === null || selectedInitialPlan.defaultMonthlyFee === undefined
                      ? 'Monto variable'
                      : peso(selectedInitialPlan.defaultMonthlyFee)}
                  </p>
                  {selectedInitialPlan.description ? (
                    <p className="text-slate-500">{selectedInitialPlan.description}</p>
                  ) : null}
                </div>
              ) : null}

              <label className="flex items-start gap-2 text-xs font-semibold text-slate-700 md:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={Boolean(initialServiceState.isCustomPriceEnabled)}
                  onChange={(event) => {
                    const isEnabled = event.target.checked
                    setInitialServiceState((prev) => {
                      const nextState = {
                        ...prev,
                        isCustomPriceEnabled: isEnabled,
                      }

                      const defaultPrice = selectedInitialPlan?.defaultMonthlyFee
                      const defaultPriceValue =
                        defaultPrice === null || defaultPrice === undefined
                          ? ''
                          : String(defaultPrice)

                      if (!isEnabled) {
                        nextState.price = defaultPriceValue
                      } else if (prev.price === '' || prev.price === null || prev.price === undefined) {
                        nextState.price = defaultPriceValue
                      }

                      return nextState
                    })
                    if (!isEnabled) {
                      setInitialServiceErrors((prev) => ({ ...prev, price: undefined }))
                    }
                  }}
                />
                <span>
                  Personalizar tarifa para este cliente
                  <span className="block text-[11px] font-normal text-slate-500">
                    Si no marcas esta opción, se aplicará la tarifa del plan sin cambios.
                  </span>
                </span>
              </label>

              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Tarifa mensual (MXN)
                  <InfoTooltip text="Puedes aplicar una tarifa distinta a la del catálogo solo para este cliente." />
                </span>
                <input
                  value={initialServiceState.price ?? ''}
                  onChange={(event) =>
                    setInitialServiceState((prev) => ({ ...prev, price: event.target.value }))
                  }
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  disabled={!initialServiceState.isCustomPriceEnabled}
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100 ${
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
                  {shouldRequireInitialBillingDay ? <span className="text-red-500">*</span> : null}
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
                  } ${isInitialCourtesy ? 'bg-slate-100 text-slate-500' : ''}`}
                  placeholder={
                    isInitialCourtesy
                      ? 'Servicio de cortesía: sin cobro mensual'
                      : shouldRequireInitialBillingDay
                        ? 'Obligatorio'
                        : 'Opcional'
                  }
                  disabled={isInitialCourtesy}
                />
                <span className="text-[11px] text-slate-500">
                  {isInitialCourtesy
                    ? 'Este servicio es de cortesía, no requiere programar cobros.'
                    : shouldRequireInitialBillingDay
                      ? 'Este plan requiere registrar un día de cobro.'
                      : 'Puedes dejarlo en blanco si no aplica un día fijo.'}
                </span>
                {initialServiceErrors.billingDay && (
                  <span className="text-xs font-medium text-red-600">
                    {initialServiceErrors.billingDay}
                  </span>
                )}
              </label>

              {planRequiresBase ? (
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  <span className="flex items-center gap-1">
                    Base asignada
                    <InfoTooltip text="Selecciona la base o nodo donde se instalará este servicio." />
                  </span>
                  <select
                    value={String(formState.base)}
                    onChange={(event) => {
                      const nextBase = Number(event.target.value)
                      setFormState((prev) => ({ ...prev, base: nextBase }))
                      setInitialServiceState((prev) => ({ ...prev, baseId: event.target.value }))
                    }}
                    className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                      initialServiceErrors.baseId
                        ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                        : 'border-slate-300'
                    }`}
                  >
                    <option value={1}>Base 1</option>
                    <option value={2}>Base 2</option>
                  </select>
                  {initialServiceErrors.baseId && (
                    <span className="text-xs font-medium text-red-600">
                      {initialServiceErrors.baseId}
                    </span>
                  )}
                </label>
              ) : null}

              {planRequiresIp
                ? currentIpFields.map(({ name, label, rangeKey }) => (
                    <label key={name} className="grid gap-1 text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-1">
                        {label}
                        <InfoTooltip text={`Selecciona una IP libre para ${label.toLowerCase()}.`} />
                      </span>
                      <select
                        value={formState[name] ?? ''}
                        onChange={(event) => setFormState((prev) => ({ ...prev, [name]: event.target.value }))}
                        className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                          formErrors[name]
                            ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                            : 'border-slate-300'
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
                        Las opciones se filtran según la base seleccionada y evitan duplicar direcciones en uso.
                      </span>
                      {formErrors[name] && (
                        <span className="text-xs font-medium text-red-600">{formErrors[name]}</span>
                      )}
                    </label>
                  ))
                : null}

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

              <label className="md:col-span-2">
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
                  {hasLocationlessClients ? (
                    <option value={LOCATION_FILTER_NONE}>Sin localidad</option>
                  ) : null}
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
                        <th scope="col" className="w-12 px-3 py-2">
                          <input
                            ref={selectAllCheckboxRef}
                            type="checkbox"
                            checked={
                              allFilteredSelected && filteredResidentialClients.length > 0
                            }
                            onChange={(event) => handleSelectAllFiltered(event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-blue-500"
                            aria-label="Seleccionar todos los clientes filtrados"
                          />
                        </th>
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
                        const isSelectedForBulk = Boolean(
                          clientRowId && selectedClientIds.has(clientRowId),
                        )
                        const rowClassName = [
                          'transition-colors',
                          isActiveRow ? 'bg-blue-50/70' : '',
                          isSelectedForBulk && !isActiveRow ? 'bg-blue-50/40' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')
                        const resolvedRowClass = rowClassName || undefined
                        const rowKey = clientRowId ?? `client-${index}`
                        const rowElementId = `client-${clientRowId ?? client.id ?? index}`
                        const primaryServiceForRow = getPrimaryService(client)
                        const primaryStatusForRow = primaryServiceForRow
                          ? formatServiceStatus(primaryServiceForRow.status)
                          : client.service
                        const primaryServiceStatus = primaryServiceForRow?.status ?? null
                        const isPrimaryActive = primaryServiceStatus === 'active'
                        const isCourtesyClient = Boolean(client.isCourtesyService)
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
                            className={resolvedRowClass}
                            aria-selected={isSelectedForBulk}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={isSelectedForBulk}
                                onChange={(event) => {
                                  event.stopPropagation()
                                  handleToggleClientSelection(clientRowId)
                                }}
                                onClick={(event) => event.stopPropagation()}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-blue-500"
                                aria-label={`Seleccionar cliente ${client.name}`}
                                disabled={!clientRowId}
                              />
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">
                            <div className="flex flex-col">
                              <span>{client.name}</span>
                              {client.ip && (
                                <span className="text-xs text-slate-500">IP: {client.ip}</span>
                              )}
                            </div>
                          </td>
                            <td className="px-3 py-2 text-slate-600">{client.location || '—'}</td>
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
                            {isCourtesyClient ? (
                              <span className="font-semibold text-emerald-700">
                                Servicio activo · {peso(0)} (cortesía)
                              </span>
                            ) : (
                              peso(primaryMonthlyFee)
                            )}
                          </td>
                            <td className="px-3 py-2 text-slate-600">
                            {client.debtMonths > 0 && !isCourtesyClient ? (
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
                              isCourtesyClient ? 'Sin deuda (cortesía)' : 'Sin deuda'
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className={ACTION_BUTTON_CLASSES}
                                onClick={() => handleToggleClientDetails(clientRowId)}
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
                          <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500">
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

      {isClientPanelOpen ? (
        <div className="pointer-events-none fixed inset-y-0 right-0 z-30 flex max-w-full">
          <div className="pointer-events-auto flex h-full w-full max-w-4xl flex-col border-l border-slate-200 bg-white shadow-2xl">
            <div className="h-full overflow-y-auto p-4">
              <section aria-labelledby="detalles-cliente" className="space-y-4">
                <Card>
                  <CardContent className="space-y-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-1">
                  <h2 id="detalles-cliente" className="text-lg font-semibold text-slate-900">
                    Detalles de {selectedClient.name}
                  </h2>
                  <p className="text-sm text-slate-500">
                    Base {selectedClient.base} · {selectedClient.location || 'Sin localidad'}
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className={ACTION_BUTTON_CLASSES}
                    onClick={handleCloseClientPanel}
                  >
                    Cerrar
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
                  {isSelectedClientCourtesy ? (
                    <p className="mt-2 text-xs font-medium text-emerald-700">
                      Servicio de cortesía · $0 MXN
                    </p>
                  ) : null}
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
                  {isSelectedClientCourtesy ? (
                    <p className="text-sm font-semibold text-emerald-700">
                      Servicio activo · {peso(0)} (cortesía)
                    </p>
                  ) : (
                    <>
                      <p className="text-base font-semibold text-slate-900">{peso(primaryServicePrice)}</p>
                      <p className="text-xs text-slate-500">
                        Adelantado: {formatPeriods(selectedClient.paidMonthsAhead)} periodo(s)
                      </p>
                    </>
                  )}
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-medium text-slate-500">Deuda acumulada</p>
                  {isSelectedClientCourtesy ? (
                    <p className="text-sm font-semibold text-emerald-700">Sin deuda (cortesía)</p>
                  ) : (
                    <>
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
                    </>
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
                      <label className="grid gap-1 text-xs font-semibold text-slate-700 md:col-span-2">
                        <span>Servicio mensual</span>
                        <select
                          value={serviceFormState.servicePlanId || ''}
                          onChange={(event) => handleSelectServicePlan(event.target.value)}
                          className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                            serviceFormErrors.servicePlanId
                              ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                              : 'border-slate-300'
                          }`}
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
                        </select>
                        {serviceFormErrors.servicePlanId && (
                          <span className="text-xs font-medium text-red-600">
                            {serviceFormErrors.servicePlanId}
                          </span>
                        )}
                        {servicePlansStatus?.error && (
                          <span className="text-xs font-medium text-red-600">
                            {servicePlansStatus.error}
                          </span>
                        )}
                      </label>

                      {selectedServicePlan ? (
                        <div className="md:col-span-2 space-y-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          <p>
                            <span className="font-semibold text-slate-700">Plan seleccionado:</span>{' '}
                            {selectedServicePlan.name}
                          </p>
                          <p>
                            <span className="font-semibold text-slate-700">Tipo de servicio:</span>{' '}
                            {getServiceTypeLabel(selectedServicePlan.serviceType ?? 'internet')}
                          </p>
                          <p>
                            <span className="font-semibold text-slate-700">Tarifa mensual:</span>{' '}
                            {selectedServicePlan.defaultMonthlyFee === null ||
                            selectedServicePlan.defaultMonthlyFee === undefined
                              ? 'Monto variable'
                              : peso(selectedServicePlan.defaultMonthlyFee)}
                          </p>
                          {selectedServicePlan.capacityType === 'limited' ? (
                            <p>
                              <span className="font-semibold text-slate-700">Cupos disponibles:</span>{' '}
                              {selectedServicePlan.capacityLimit ?? 'Definir en catálogo'}
                            </p>
                          ) : null}
                          {selectedServicePlan.description ? (
                            <p className="text-slate-500">{selectedServicePlan.description}</p>
                          ) : null}
                        </div>
                      ) : null}

                      <label className="flex items-start gap-2 text-xs font-semibold text-slate-700 md:col-span-2">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={Boolean(serviceFormState.isCustomPriceEnabled)}
                          onChange={(event) => {
                            const isEnabled = event.target.checked
                            setServiceFormState((prev) => {
                              const nextState = { ...prev, isCustomPriceEnabled: isEnabled }
                              const defaultPrice =
                                selectedServicePlan?.defaultMonthlyFee === null ||
                                selectedServicePlan?.defaultMonthlyFee === undefined
                                  ? ''
                                  : String(selectedServicePlan.defaultMonthlyFee)
                              if (!isEnabled) {
                                nextState.price = defaultPrice
                              } else if (
                                (prev.price === '' || prev.price === null || prev.price === undefined) &&
                                selectedServicePlan
                              ) {
                                nextState.price = defaultPrice
                              }
                              return nextState
                            })
                            if (!isEnabled) {
                              setServiceFormErrors((prev) => ({ ...prev, price: undefined }))
                            }
                          }}
                          disabled={!selectedServicePlan}
                        />
                        <span>
                          Personalizar tarifa para este cliente
                          <span className="block text-[11px] font-normal text-slate-500">
                            Si no marcas esta opción, se aplicará la tarifa del plan sin cambios.
                          </span>
                        </span>
                      </label>

                      <label className="grid gap-1 text-xs font-semibold text-slate-700">
                        <span>Tarifa mensual (MXN)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={serviceFormState.price ?? ''}
                          onChange={(event) =>
                            setServiceFormState((prev) => ({
                              ...prev,
                              price: event.target.value,
                            }))
                          }
                          disabled={!serviceFormState.isCustomPriceEnabled || !selectedServicePlan}
                          className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100 ${
                            serviceFormErrors.price
                              ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                              : 'border-slate-300'
                          }`}
                          placeholder="0.00"
                        />
                        {serviceFormErrors.price && (
                          <span className="text-xs font-medium text-red-600">
                            {serviceFormErrors.price}
                          </span>
                        )}
                      </label>

                      <label className="grid gap-1 text-xs font-semibold text-slate-700">
                        <span>
                          Día de cobro (1-31){' '}
                          {shouldRequireServiceBillingDay ? <span className="text-red-500">*</span> : null}
                        </span>
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
                          } ${isServiceFormCourtesy ? 'bg-slate-100 text-slate-500' : ''}`}
                          placeholder={
                            isServiceFormCourtesy
                              ? 'Servicio de cortesía: sin cobro mensual'
                              : shouldRequireServiceBillingDay
                                ? 'Obligatorio'
                                : 'Opcional'
                          }
                          disabled={isServiceFormCourtesy}
                        />
                        <span className="text-[11px] text-slate-500">
                          {isServiceFormCourtesy
                            ? 'Este servicio es de cortesía, no requiere programar cobros.'
                            : shouldRequireServiceBillingDay
                              ? 'Este plan requiere registrar un día de cobro.'
                              : 'Puedes dejarlo en blanco si no aplica un día fijo.'}
                        </span>
                        {serviceFormErrors.billingDay && (
                          <span className="text-xs font-medium text-red-600">
                            {serviceFormErrors.billingDay}
                          </span>
                        )}
                      </label>

                      <label className="grid gap-1 text-xs font-semibold text-slate-700">
                        <span>
                          {servicePlanRequiresBase ? 'Base asignada *' : 'Base (opcional)'}
                        </span>
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
                      const isServiceCourtesy = Number.isFinite(servicePrice) && servicePrice <= 0
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
                              {isServiceCourtesy ? (
                                <p>Tarifa mensual: {peso(0)} (cortesía)</p>
                              ) : hasPrice ? (
                                <p>Tarifa mensual: {peso(servicePrice)}</p>
                              ) : (
                                <p>Tarifa mensual: monto variable</p>
                              )}
                              {isServiceCourtesy ? (
                                <p>Este servicio no genera cobros mensuales.</p>
                              ) : service.nextBillingDate ? (
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
            </div>
          </div>
        </div>
      ) : null}

        </>
      ) : (
        <MonthlyServicesPage variant="embedded" />
      )}
      <BulkAssignServicesModal
        isOpen={isBulkAssignModalOpen}
        onClose={handleCloseBulkAssign}
        onSubmit={handleBulkAssignSubmit}
        isProcessing={isProcessingBulkAssign}
        clients={selectedClientsForBulk}
        servicePlans={servicePlans}
      />
    </div>
  )
}
