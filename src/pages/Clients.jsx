import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import InfoTooltip from '../components/ui/InfoTooltip.jsx'
import ImportClientsModal from '../components/clients/ImportClientsModal.jsx'
import BulkAssignServicesModal from '../components/clients/BulkAssignServicesModal.jsx'
import AssignExtraServicesModal from '../components/clients/AssignExtraServicesModal.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { CLIENT_PRICE, useBackofficeStore } from '../store/useBackofficeStore.js'
import { useClients } from '../hooks/useClients.js'
import { useServicePlans } from '../hooks/useServicePlans.js'
import { useClientServices } from '../hooks/useClientServices.js'
import { useToast } from '../hooks/useToast.js'
import { peso, formatDate, formatPeriodLabel, addMonthsToPeriod } from '../utils/formatters.js'
import { SERVICE_STATUS_OPTIONS, getServiceTypeLabel, getServiceStatusLabel } from '../constants/serviceTypes.js'
import { computeServiceFormErrors } from '../utils/serviceFormValidation.js'
import { isCourtesyPrice, resolveEffectivePriceForFormState } from '../utils/effectivePrice.js'
import { CLIENT_ANTENNA_MODELS } from '../utils/clientIpConfig.js'
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

const parseNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

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

const isInternetLikeService = (serviceType) => {
  const normalized = String(serviceType ?? '').toLowerCase()
  return normalized === 'internet' || normalized === 'hotspot'
}

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

const createInitialServiceState = (zoneId) => ({
  servicePlanId: '',
  displayName: '',
  serviceType: 'internet',
  price: '',
  billingDay: '1',
  baseId: zoneId ? String(zoneId) : '',
  status: 'active',
  notes: '',
  isCustomPriceEnabled: false,
})

const defaultForm = {
  type: 'residential',
  name: '',
  location: '',
  zoneId: '',
  notes: '',
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
    bulkAssignClientServices: bulkAssignClientServicesToMultiple,
    updateClientServiceStatus,
    deleteClient,
    importClients,
  } = useClients()
  const {
    bulkAssignClientServices: bulkAssignServicesForClient,
    deleteClientService,
  } = useClientServices({ autoLoad: false })
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
  const [isPrimaryServiceFormVisible, setIsPrimaryServiceFormVisible] = useState(false)
  const [initialServiceState, setInitialServiceState] = useState(() =>
    createInitialServiceState(defaultForm.zoneId),
  )
  const [initialServiceErrors, setInitialServiceErrors] = useState({})
  const [serviceFormState, setServiceFormState] = useState({
    servicePlanId: '',
    price: '',
    isCustomPriceEnabled: false,
    billingDay: '1',
    baseId: '',
    status: 'active',
    notes: '',
  })
  const [serviceFormErrors, setServiceFormErrors] = useState({})
  const [selectedClientIds, setSelectedClientIds] = useState(() => new Set())
  const [isBulkAssignModalOpen, setIsBulkAssignModalOpen] = useState(false)
  const [isProcessingBulkAssign, setIsProcessingBulkAssign] = useState(false)
  const [pendingExtraServicePlans, setPendingExtraServicePlans] = useState([])
  const [extraServicesModalState, setExtraServicesModalState] = useState({
    isOpen: false,
    mode: 'create',
    client: null,
    selectedPlanIds: [],
    clientName: '',
    excludedPlanIds: [],
  })
  const [isProcessingExtraServices, setIsProcessingExtraServices] = useState(false)
  const [isProcessingSelectionAction, setIsProcessingSelectionAction] = useState(false)
  const activeServicePlans = useMemo(
    () =>
      servicePlans.filter(
        (plan) => plan && plan.isActive !== false && plan.is_active !== false,
      ),
    [servicePlans],
  )
  const servicePlanOptions = useMemo(
    () =>
      activeServicePlans
        .filter((plan) =>
          isInternetLikeService(plan?.serviceType ?? plan?.service_type),
        )
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
  const primaryPlanId = useMemo(
    () =>
      initialServiceState?.servicePlanId
        ? String(initialServiceState.servicePlanId)
        : null,
    [initialServiceState?.servicePlanId],
  )
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
  const extraServicesSelected = useMemo(
    () =>
      pendingExtraServicePlans
        .map((planId) =>
          servicePlans.find((plan) => String(plan.id) === String(planId)),
        )
        .filter(Boolean),
    [pendingExtraServicePlans, servicePlans],
  )
  const pendingExtraServicePlanIdsSet = useMemo(
    () => new Set(pendingExtraServicePlans.map((value) => String(value))),
    [pendingExtraServicePlans],
  )
  const additionalServicePlans = useMemo(
    () => activeServicePlans.filter((plan) => String(plan.id) !== primaryPlanId),
    [activeServicePlans, primaryPlanId],
  )
  const quickServicePlans = useMemo(
    () => additionalServicePlans.slice(0, 6),
    [additionalServicePlans],
  )
  const hasMoreServicePlans = useMemo(
    () => additionalServicePlans.length > quickServicePlans.length,
    [additionalServicePlans, quickServicePlans],
  )
  const handleToggleQuickExtraPlan = useCallback(
    (planId) => {
      const normalizedId = String(planId)
      if (primaryPlanId && normalizedId === primaryPlanId) {
        return
      }
      setPendingExtraServicePlans((prev) => {
        const next = new Set(prev.map((value) => String(value)))
        if (next.has(normalizedId)) {
          next.delete(normalizedId)
        } else {
          next.add(normalizedId)
        }
        return Array.from(next)
      })
    },
    [primaryPlanId],
  )
  const handleRemoveExtraPlan = useCallback((planId) => {
    const normalizedId = String(planId)
    setPendingExtraServicePlans((prev) =>
      prev.filter((value) => String(value) !== normalizedId),
    )
  }, [])
  const selectedServicesSummary = useMemo(() => {
    const summary = []
    const seen = new Set()

    if (selectedInitialPlan) {
      const planId = primaryPlanId ?? String(selectedInitialPlan.id)
      if (!seen.has(planId)) {
        seen.add(planId)
        const categorySource =
          selectedInitialPlan.serviceType ??
          selectedInitialPlan.service_type ??
          selectedInitialPlan.category
        summary.push({
          id: planId,
          name: selectedInitialPlan.name,
          category: getServiceTypeLabel(categorySource ?? 'internet'),
          isPrimary: true,
        })
      }
    }

    extraServicesSelected.forEach((plan) => {
      if (!plan) {
        return
      }
      const planId = String(plan.id)
      if (seen.has(planId)) {
        return
      }
      seen.add(planId)
      const categorySource = plan.serviceType ?? plan.service_type ?? plan.category
      summary.push({
        id: planId,
        name: plan.name,
        category: getServiceTypeLabel(categorySource ?? 'other'),
        isPrimary: false,
      })
    })

    return summary
  }, [extraServicesSelected, primaryPlanId, selectedInitialPlan])
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
  const planRequiresIp = Boolean(
    selectedInitialPlan?.requiresIp ?? selectedInitialPlan?.requires_ip,
  )
  const planRequiresBase = Boolean(
    selectedInitialPlan?.requiresBase ?? selectedInitialPlan?.requires_base,
  )
  const planRequiresBillingDay = Boolean(
    planRequiresIp ||
      planRequiresBase ||
      (selectedInitialPlan &&
        isInternetLikeService(
          selectedInitialPlan.serviceType ?? selectedInitialPlan.service_type,
        )),
  )
  const servicePlanRequiresIp = Boolean(
    selectedServicePlan?.requiresIp ?? selectedServicePlan?.requires_ip,
  )
  const servicePlanRequiresBase = Boolean(
    selectedServicePlan?.requiresBase ?? selectedServicePlan?.requires_base,
  )
  const servicePlanRequiresBillingDay = Boolean(
    servicePlanRequiresIp ||
      servicePlanRequiresBase ||
      (selectedServicePlan &&
        isInternetLikeService(
          selectedServicePlan.serviceType ?? selectedServicePlan.service_type,
        )),
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

    const rows = clients.map((client) => {
      const primaryService = getPrimaryService(client)
      const ipAddress = primaryService?.ipAddress ?? client.ip ?? ''
      const antennaIp = primaryService?.antennaIp ?? client.antennaIp ?? ''
      const modemIp = primaryService?.modemIp ?? client.modemIp ?? ''
      const serviceStatus = primaryService
        ? formatServiceStatus(primaryService.status)
        : client.service ?? ''

      return [
        client.type ?? '',
        client.name ?? '',
        client.location ?? '',
        client.base ?? '',
        ipAddress,
        antennaIp,
        modemIp,
        client.monthlyFee ?? '',
        client.paidMonthsAhead ?? '',
        client.debtMonths ?? '',
        serviceStatus,
      ]
    })

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
      const serviceNames = Array.isArray(client.services)
        ? client.services.map((service) => service?.name ?? service?.plan?.name ?? '')
        : []
      const primaryService = getPrimaryService(client)
      const networkValues = primaryService
        ? [primaryService.ipAddress, primaryService.antennaIp, primaryService.modemIp]
        : [client.ip, client.antennaIp, client.modemIp]
      const searchValues = [
        client.name,
        client.location,
        client.zoneId,
        ...serviceNames,
        ...networkValues,
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
  const canActivateSelection = useMemo(
    () =>
      selectedClientsForBulk.some((client) => {
        const primary = getPrimaryService(client)
        return primary && primary.status !== 'active' && primary.status !== 'cancelled'
      }),
    [selectedClientsForBulk],
  )
  const canSuspendSelection = useMemo(
    () =>
      selectedClientsForBulk.some((client) => {
        const primary = getPrimaryService(client)
        return primary && primary.status === 'active'
      }),
    [selectedClientsForBulk],
  )

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

  const handleOpenExtraServicesForClient = useCallback((client) => {
    if (!client || !client.id) {
      return
    }

    const services = Array.isArray(client.services) ? client.services : []
    const selectedPlanIds = services
      .map((service) => {
        const planId =
          service?.servicePlanId ?? service?.plan?.id ?? service?.service_plan_id ?? null
        return planId ? String(planId) : null
      })
      .filter(Boolean)

    setExtraServicesModalState({
      isOpen: true,
      mode: 'edit',
      client,
      selectedPlanIds,
      clientName: client.name ?? 'Cliente',
      excludedPlanIds: [],
    })
  }, [])

  const handleManageSelectedClientServices = useCallback(() => {
    if (!isSingleSelection || selectedClientsForBulk.length === 0) {
      showToast({
        type: 'info',
        title: 'Selecciona un cliente',
        description: 'Elige un solo cliente para gestionar sus servicios.',
      })
      return
    }

    const [clientToManage] = selectedClientsForBulk
    if (clientToManage) {
      handleOpenExtraServicesForClient(clientToManage)
    }
  }, [handleOpenExtraServicesForClient, isSingleSelection, selectedClientsForBulk, showToast])

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
        await bulkAssignClientServicesToMultiple({
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
    [bulkAssignClientServicesToMultiple, selectedClientsForBulk, showToast],
  )

  const handleOpenExtraServicesForCreate = useCallback(() => {
    const excludedPlanIds = primaryPlanId ? [primaryPlanId] : []
    setExtraServicesModalState({
      isOpen: true,
      mode: 'create',
      client: null,
      selectedPlanIds: pendingExtraServicePlans.map((value) => String(value)),
      clientName: formState.name?.trim() ? formState.name.trim() : 'Nuevo cliente',
      excludedPlanIds,
    })
  }, [formState.name, pendingExtraServicePlans, primaryPlanId])

  const handleCloseExtraServicesModal = useCallback(() => {
    if (isProcessingExtraServices) {
      return
    }
    setExtraServicesModalState((prev) => ({ ...prev, isOpen: false }))
  }, [isProcessingExtraServices])

  const handleApplyExtraServices = useCallback(
    async (selectedPlanIds = []) => {
      if (extraServicesModalState.mode === 'create') {
        const normalizedSelection = Array.from(
          new Set((selectedPlanIds ?? []).map((value) => String(value)).filter(Boolean)),
        )
        setPendingExtraServicePlans(normalizedSelection)
        setExtraServicesModalState((prev) => ({
          ...prev,
          isOpen: false,
          selectedPlanIds: normalizedSelection,
        }))

        if (normalizedSelection.length > 0) {
          const labels = normalizedSelection
            .map((planId) =>
              servicePlans.find((plan) => String(plan.id) === planId)?.name ?? null,
            )
            .filter(Boolean)
          showToast({
            type: 'success',
            title: 'Servicios preparados',
            description:
              labels.length > 0
                ? `Se agregarán ${labels.join(', ')} al guardar el cliente.`
                : 'Se agregarán servicios adicionales al guardar el cliente.',
          })
        } else {
          showToast({
            type: 'info',
            title: 'Sin servicios adicionales',
            description: 'Puedes agregar servicios extra en cualquier momento.',
          })
        }
        return
      }

      const targetClient = extraServicesModalState.client
      const normalizedClientId = normalizeId(targetClient?.id)
      if (!normalizedClientId) {
        setExtraServicesModalState({
          isOpen: false,
          mode: 'create',
          client: null,
          selectedPlanIds: [],
          clientName: '',
          excludedPlanIds: [],
        })
        return
      }

      const normalizedSelection = Array.from(
        new Set((selectedPlanIds ?? []).map((value) => String(value)).filter(Boolean)),
      )

      const existingServices = Array.isArray(targetClient?.services)
        ? targetClient.services
        : []

      const existingByPlan = new Map()
      existingServices.forEach((service) => {
        const planId = String(service?.servicePlanId ?? service?.plan?.id ?? '')
        if (!planId) {
          return
        }
        if (!existingByPlan.has(planId)) {
          existingByPlan.set(planId, [])
        }
        existingByPlan.get(planId).push(service)
      })

      const existingSet = new Set(existingByPlan.keys())
      const selectedSet = new Set(normalizedSelection)

      const toAssign = [...selectedSet].filter((planId) => !existingSet.has(planId))
      const toRemove = [...existingSet].filter((planId) => !selectedSet.has(planId))

      setIsProcessingExtraServices(true)
      try {
        for (const planId of toAssign) {
          const numericPlanId = Number(planId)
          if (!Number.isFinite(numericPlanId) || numericPlanId <= 0) {
            continue
          }
          await bulkAssignServicesForClient({
            serviceId: numericPlanId,
            clientIds: [normalizedClientId],
            initialState: 'active',
            useClientZone: true,
          })
        }

        for (const planId of toRemove) {
          const servicesForPlan = existingByPlan.get(planId) ?? []
          for (const service of servicesForPlan) {
            if (service?.id) {
              await deleteClientService(service.id)
            }
          }
        }

        showToast({
          type: 'success',
          title: 'Servicios actualizados',
          description: 'Se aplicaron los cambios a los servicios del cliente.',
        })
        await reloadClients()
      } catch (error) {
        showToast({
          type: 'error',
          title: 'No se pudieron actualizar los servicios',
          description: resolveApiErrorMessage(error, 'Intenta nuevamente.'),
        })
      } finally {
        setIsProcessingExtraServices(false)
        setExtraServicesModalState({
          isOpen: false,
          mode: 'create',
          client: null,
          selectedPlanIds: [],
          clientName: '',
          excludedPlanIds: [],
        })
      }
    },
    [
      bulkAssignServicesForClient,
      deleteClientService,
      extraServicesModalState,
      reloadClients,
      servicePlans,
      showToast,
    ],
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

    const zoneValue = Number(formState.zoneId)
    const nextZoneId = Number.isFinite(zoneValue) ? String(zoneValue) : ''
    setInitialServiceState((prev) => {
      if (prev.baseId === nextZoneId) {
        return prev
      }
      return { ...prev, baseId: nextZoneId }
    })
  }, [formState.zoneId, planRequiresBase])

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
      if (prev.billingDay && String(prev.billingDay).trim()) {
        return prev
      }
      return { ...prev, billingDay: '1' }
    })
  }, [isInitialCourtesy])

  useEffect(() => {
    if (!isServiceFormCourtesy) {
      return
    }

    setServiceFormState((prev) => {
      if (prev.billingDay && String(prev.billingDay).trim()) {
        return prev
      }
      return { ...prev, billingDay: '1' }
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
      if (!prev.servicePlanId) {
        return prev
      }

      const activeMatch = servicePlans.find(
        (plan) => String(plan.id) === String(prev.servicePlanId),
      )
      if (activeMatch) {
        return prev
      }

      return {
        ...prev,
        servicePlanId: '',
        serviceType: 'internet',
        displayName: '',
        price: '',
        isCustomPriceEnabled: false,
      }
    })
  }, [servicePlans])

  useEffect(() => {
    if (!primaryPlanId) {
      return
    }

    setPendingExtraServicePlans((prev) =>
      prev.filter((planId) => String(planId) !== primaryPlanId),
    )
  }, [primaryPlanId])

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
      billingDay: '1',
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
    const serviceEffectivePrice = parseNumberOrNull(
      primaryService?.effectivePrice ?? primaryService?.price,
    )
    if (serviceEffectivePrice !== null) {
      return serviceEffectivePrice
    }
    return parseNumberOrNull(selectedClient?.monthlyFee)
  }, [primaryService?.effectivePrice, primaryService?.price, selectedClient?.monthlyFee])

  const validateForm = () => {
    const errors = {}

    if (!formState.name.trim()) {
      errors.name = 'El nombre es obligatorio.'
    }

    const locationValue =
      typeof formState.location === 'string' ? formState.location.trim() : ''
    if (!locationValue) {
      errors.location = 'Selecciona la comunidad del cliente.'
    }

    const zoneValue =
      typeof formState.zoneId === 'string' ? formState.zoneId.trim() : ''
    if (zoneValue) {
      const parsedZone = Number(zoneValue)
      if (!Number.isInteger(parsedZone) || parsedZone <= 0) {
        errors.zoneId = 'Ingresa una zona válida.'
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
    if (!initialServiceState.servicePlanId) {
      setInitialServiceErrors({})
      return true
    }

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
          serviceType: 'internet',
          displayName: '',
          price: '',
          isCustomPriceEnabled: false,
          billingDay: '1',
          notes: '',
        }))
        setInitialServiceErrors((prev) => {
          if (!prev || typeof prev !== 'object') {
            return {}
          }
          const next = { ...prev }
          delete next.servicePlanId
          delete next.price
          delete next.baseId
          delete next.billingDay
          delete next.status
          return next
        })
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

      const resolvedServiceType = foundPlan.serviceType ?? foundPlan.service_type

      const defaultPrice =
        foundPlan.defaultMonthlyFee === null || foundPlan.defaultMonthlyFee === undefined
          ? ''
          : String(foundPlan.defaultMonthlyFee)

      setInitialServiceState((prev) => ({
        ...prev,
        servicePlanId: String(foundPlan.id),
        serviceType: resolvedServiceType ?? prev.serviceType,
        displayName:
          foundPlan.name ?? getServiceTypeLabel(resolvedServiceType ?? prev.serviceType),
        price: defaultPrice,
        isCustomPriceEnabled: false,
        billingDay: prev.billingDay && String(prev.billingDay).trim() ? prev.billingDay : '1',
      }))

      setInitialServiceErrors({})
    },
    [servicePlans],
  )

  const handleHidePrimaryServiceForm = useCallback(() => {
    setInitialServiceState(createInitialServiceState(formState.zoneId))
    setInitialServiceErrors({})
    setPendingExtraServicePlans([])
    setIsPrimaryServiceFormVisible(false)
  }, [formState.zoneId])

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

    const zoneValue = Number(formState.zoneId)
    const normalizedZoneId =
      Number.isInteger(zoneValue) && zoneValue > 0 ? zoneValue : null

    const clientName = formState.name.trim()
    const initialServiceSnapshot = { ...initialServiceState }
    const serviceAssignments = []

    const resolveBillingDay = (billingDayValue) => {
      const parsed = Number(billingDayValue)
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 31) {
        return parsed
      }
      return 1
    }

    const resolveBaseId = (baseValue) => {
      if (baseValue === '' || baseValue === null || baseValue === undefined) {
        return null
      }
      const parsed = Number(baseValue)
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null
    }

    const parsedInitialPlanId = Number(initialServiceSnapshot.servicePlanId)
    const initialNotes = initialServiceSnapshot.notes?.trim()
    const initialBillingDay = resolveBillingDay(initialServiceSnapshot.billingDay)
    const initialBaseId = resolveBaseId(initialServiceSnapshot.baseId)
    const initialCustomPrice = initialServiceSnapshot.isCustomPriceEnabled
      ? Number(initialServiceEffectivePrice)
      : null

    if (Number.isFinite(parsedInitialPlanId) && parsedInitialPlanId > 0) {
      const assignment = {
        servicePlanId: parsedInitialPlanId,
        status: initialServiceSnapshot.status || 'active',
      }

      if (initialBillingDay !== null) {
        assignment.billingDay = initialBillingDay
      }
      if (initialBaseId !== null) {
        assignment.baseId = initialBaseId
      } else if (normalizedZoneId !== null) {
        assignment.baseId = normalizedZoneId
      }
      if (initialCustomPrice !== null && Number.isFinite(initialCustomPrice)) {
        assignment.customPrice = initialCustomPrice
      }
      if (initialNotes) {
        assignment.notes = initialNotes
      }

      serviceAssignments.push(assignment)
    }

    const extraPlanIds = Array.from(pendingExtraServicePlanIdsSet).filter(
      (planId) => planId && planId !== (primaryPlanId ?? ''),
    )

    extraPlanIds.forEach((planId) => {
      const numericPlanId = Number(planId)
      if (!Number.isFinite(numericPlanId) || numericPlanId <= 0) {
        return
      }
      serviceAssignments.push({
        servicePlanId: numericPlanId,
        status: 'active',
      })
    })

    if (serviceAssignments.length > 0) {
      const primaryAssignment = serviceAssignments[0]
      if (formState.ip?.trim()) {
        primaryAssignment.ipAddress = formState.ip.trim()
      }
      if (formState.antennaIp?.trim()) {
        primaryAssignment.antennaIp = formState.antennaIp.trim()
      }
      if (formState.modemIp?.trim()) {
        primaryAssignment.modemIp = formState.modemIp.trim()
      }
      if (formState.antennaModel) {
        primaryAssignment.antennaModel = formState.antennaModel
      }
      if (formState.modemModel?.trim()) {
        primaryAssignment.modemModel = formState.modemModel.trim()
      }
    }

    const resolvePlanPrice = (planId) => {
      const plan = servicePlans.find((item) => String(item.id) === String(planId))
      if (!plan) {
        return null
      }
      const priceCandidate =
        plan.defaultMonthlyFee ?? plan.monthlyPrice ?? plan.monthly_price
      const numericPrice = Number(priceCandidate)
      return Number.isFinite(numericPrice) ? numericPrice : null
    }

    let normalizedMonthlyFee = null
    if (serviceAssignments.length > 0) {
      if (Number.isFinite(initialServiceEffectivePrice)) {
        normalizedMonthlyFee = Number(initialServiceEffectivePrice)
      } else {
        normalizedMonthlyFee = resolvePlanPrice(serviceAssignments[0].servicePlanId)
      }
    }

    if (!Number.isFinite(normalizedMonthlyFee)) {
      normalizedMonthlyFee = null
    }

    const payload = {
      type: formState.type,
      name: clientName,
      location: formState.location,
      zoneId: normalizedZoneId,
      base: normalizedZoneId,
      notes: formState.notes?.trim() ? formState.notes.trim() : null,
      debtMonths: 0,
      paidMonthsAhead: 0,
      monthlyFee: normalizedMonthlyFee,
      services: serviceAssignments,
      service: serviceAssignments.length > 0 ? 'Activo' : 'Suspendido',
    }

    const selectedServiceNames = selectedServicesSummary.map((service) => service.name)

    try {
      const newClient = await createClient(payload)
      const hasServicesAssigned = serviceAssignments.length > 0
      const successDescription = (() => {
        if (!clientName) {
          return 'El cliente se registró correctamente.'
        }
        if (hasServicesAssigned && selectedServiceNames.length > 0) {
          return `Se agregó a ${clientName} con ${selectedServiceNames.join(', ')}.`
        }
        if (hasServicesAssigned) {
          return `Se agregó a ${clientName} con servicios activos.`
        }
        return `Se agregó a ${clientName} sin servicios asignados.`
      })()

      showToast({
        type: 'success',
        title: 'Cliente agregado',
        description: successDescription,
      })
      setFormState({ ...defaultForm })
      setFormErrors({})
      setInitialServiceState(createInitialServiceState(defaultForm.zoneId))
      setInitialServiceErrors({})
      setIsPrimaryServiceFormVisible(false)
      setPendingExtraServicePlans([])

      const normalizedNewClientId = normalizeId(newClient?.id)
      if (normalizedNewClientId) {
        shouldOpenServiceFormRef.current = false
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

  const handleUpdateSelectionStatusBulk = useCallback(
    async (nextStatus) => {
      if (isMutatingClients || isProcessingSelectionAction) {
        return
      }

      if (selectedClientsCount === 0) {
        showToast({
          type: 'info',
          title: 'Selecciona clientes',
          description: 'Elige al menos un cliente para actualizar el estado de sus servicios.',
        })
        return
      }

      const normalizedStatus = nextStatus === 'active' ? 'active' : 'suspended'
      const actionable = selectedClientsForBulk
        .map((client) => ({ client, service: getPrimaryService(client) }))
        .filter(({ service }) => service && service.status !== normalizedStatus && service.status !== 'cancelled')

      if (actionable.length === 0) {
        showToast({
          type: 'info',
          title: 'Sin cambios por aplicar',
          description: 'Selecciona clientes con servicios disponibles para actualizar.',
        })
        return
      }

      setIsProcessingSelectionAction(true)
      let successCount = 0
      let errorCount = 0
      let lastError = null

      for (const { client, service } of actionable) {
        try {
          await updateClientServiceStatus(client.id, service.id, normalizedStatus)
          successCount += 1
        } catch (error) {
          errorCount += 1
          lastError = error
        }
      }

      setIsProcessingSelectionAction(false)

      if (successCount > 0) {
        const title = normalizedStatus === 'active' ? 'Servicios activados' : 'Servicios suspendidos'
        const description =
          successCount === 1
            ? 'Se actualizó el servicio seleccionado.'
            : `Se actualizaron ${successCount} servicios seleccionados.`
        showToast({
          type: 'success',
          title,
          description,
        })
      }

      if (errorCount > 0) {
        showToast({
          type: 'error',
          title: 'Algunos servicios no se actualizaron',
          description: resolveApiErrorMessage(lastError, 'Revisa la selección e intenta nuevamente.'),
        })
      }
    },
    [
      getPrimaryService,
      isMutatingClients,
      isProcessingSelectionAction,
      selectedClientsCount,
      selectedClientsForBulk,
      showToast,
      updateClientServiceStatus,
    ],
  )

  const handleActivateSelection = useCallback(() => {
    void handleUpdateSelectionStatusBulk('active')
  }, [handleUpdateSelectionStatusBulk])

  const handleSuspendSelection = useCallback(() => {
    void handleUpdateSelectionStatusBulk('suspended')
  }, [handleUpdateSelectionStatusBulk])

  const isClientsTabActive = activeMainTab === 'clients'

  if (shouldShowSkeleton) {
    return <ClientsSkeleton />
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">Panel operativo de clientes</h1>
          <p className="text-sm text-slate-600">
            Gestiona tus clientes, consulta su estado y administra los servicios mensuales disponibles.
          </p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <div className="inline-flex w-full flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-slate-100 p-1 md:w-auto md:self-end">
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
          {isClientsTabActive ? (
            <div className="inline-flex w-full flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-slate-100 p-1 md:w-auto md:self-end">
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
          ) : null}
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

        {activeClientsSubTab === 'create' ? (
          <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Tipo de cliente
                  <InfoTooltip text="Elige si es un cliente residencial o un punto con antena pública." />
                </span>
                <select
                  value={formState.type}
                  onChange={(event) => {
                    const newType = event.target.value
                    setFormState((prev) => ({ ...prev, type: newType }))
                    setFormErrors((prev) => ({ ...prev, type: undefined }))
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
                  <InfoTooltip text="Utiliza el nombre con el que aparece en contratos o facturación." />
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
                  Comunidad
                  <InfoTooltip text="Selecciona la comunidad donde se ubica el cliente." />
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
                  <option value="">Selecciona una comunidad</option>
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
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  Zona (opcional)
                  <InfoTooltip text="Asocia al cliente con una zona de cobertura para segmentar reportes y métricas." />
                </span>
                <input
                  value={formState.zoneId}
                  onChange={(event) => setFormState((prev) => ({ ...prev, zoneId: event.target.value }))}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    formErrors.zoneId
                      ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-200'
                      : 'border-slate-300'
                  }`}
                  placeholder="Ej. 3"
                />
                {formErrors.zoneId && (
                  <span className="text-xs font-medium text-red-600">{formErrors.zoneId}</span>
                )}
              </label>
            </div>

            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1">
                Notas
                <InfoTooltip text="Agrega comentarios internos, referencias o necesidades especiales." />
              </span>
              <textarea
                value={formState.notes}
                onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                placeholder="Ej. Referencia de domicilio o instrucciones de instalación"
              />
            </label>

            {!isPrimaryServiceFormVisible ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-center border border-dashed border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-700"
                onClick={() => {
                  setIsPrimaryServiceFormVisible(true)
                  setInitialServiceErrors({})
                }}
              >
                + Agregar servicio principal (opcional)
              </Button>
            ) : (
              <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-slate-900">Servicio principal</h3>
                    <p className="text-xs text-slate-600">
                      Selecciona un plan mensual para asignarlo al cliente o ciérralo si solo deseas registrar sus datos.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="self-start border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white"
                    onClick={handleHidePrimaryServiceForm}
                  >
                    Quitar servicio
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-slate-700 md:col-span-2">
                    <span className="flex items-center gap-1">
                      Servicio mensual disponible
                      <InfoTooltip text="Solo se muestran planes de internet activos." />
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
                        {isLoadingServicePlans ? 'Cargando servicios…' : 'Sin servicio principal'}
                      </option>
                      {servicePlanOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {servicePlansStatus?.error && (
                      <span className="text-xs font-medium text-red-600">
                        {servicePlansStatus.error}
                      </span>
                    )}
                  </label>

                  {selectedInitialPlan ? (
                    <>
                      <div className="md:col-span-2 space-y-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                        <p>
                          <span className="font-semibold text-slate-700">Plan seleccionado:</span> {selectedInitialPlan.name}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-700">Tipo de servicio:</span>{' '}
                          {getServiceTypeLabel(
                            selectedInitialPlan.serviceType ??
                              selectedInitialPlan.service_type ??
                              'internet',
                          )}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-700">Tarifa mensual:</span>{' '}
                          {selectedInitialPlan.defaultMonthlyFee === null ||
                          selectedInitialPlan.defaultMonthlyFee === undefined
                            ? 'Monto variable'
                            : peso(selectedInitialPlan.defaultMonthlyFee)}
                        </p>
                        {selectedInitialPlan.description ? (
                          <p className="text-slate-500">{selectedInitialPlan.description}</p>
                        ) : null}
                      </div>

                      <div className="md:col-span-2 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <Button
                            type="button"
                            variant="ghost"
                            className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
                            onClick={handleOpenExtraServicesForCreate}
                          >
                            {hasMoreServicePlans ? 'Agregar más servicios' : 'Gestionar servicios'}
                          </Button>
                          {selectedServicesSummary.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                              {selectedServicesSummary.map((service) => (
                                <span
                                  key={service.id}
                                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1"
                                >
                                  <span className="font-semibold text-slate-800">{service.name}</span>
                                  <span className="uppercase tracking-wide text-[10px] text-slate-500">
                                    {service.category}
                                  </span>
                                  {service.isPrimary ? (
                                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                      Principal
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveExtraPlan(service.id)}
                                      className="inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                    >
                                      Quitar
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500">
                              Sin servicios adicionales seleccionados.
                            </span>
                          )}
                        </div>

                        {quickServicePlans.length > 0 ? (
                          <div className="grid gap-2 md:grid-cols-2">
                            {quickServicePlans.map((plan) => {
                              const planId = String(plan.id)
                              const isChecked = pendingExtraServicePlanIdsSet.has(planId)
                              const planCategory =
                                plan.serviceType ?? plan.service_type ?? plan.category
                              const planPrice =
                                plan.defaultMonthlyFee ?? plan.monthlyPrice ?? plan.monthly_price
                              return (
                                <label
                                  key={planId}
                                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition ${
                                    isChecked
                                      ? 'border-blue-300 bg-blue-50/60'
                                      : 'border-slate-200 bg-white hover:border-blue-200'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleQuickExtraPlan(planId)}
                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-blue-500"
                                  />
                                  <div className="space-y-1">
                                    <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
                                    <p className="text-xs text-slate-500">
                                      {getServiceTypeLabel(planCategory ?? 'other')}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {planPrice === null || planPrice === undefined
                                        ? 'Monto variable'
                                        : peso(planPrice)}
                                    </p>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>

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
                              } else if (
                                prev.price === '' ||
                                prev.price === null ||
                                prev.price === undefined
                              ) {
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

                      {initialServiceState.isCustomPriceEnabled ? (
                        <label className="grid gap-1 text-xs font-semibold text-slate-700">
                          <span className="flex items-center gap-1">
                            Tarifa mensual (MXN)
                            <InfoTooltip text="Define una tarifa distinta a la del catálogo solo para este cliente." />
                          </span>
                          <input
                            value={initialServiceState.price ?? ''}
                            onChange={(event) =>
                              setInitialServiceState((prev) => ({
                                ...prev,
                                price: event.target.value,
                              }))
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
                      ) : null}

                      <label className="grid gap-1 text-xs font-semibold text-slate-700">
                        <span className="flex items-center gap-1">
                          Día de cobro
                          {shouldRequireInitialBillingDay ? <span className="text-red-500">*</span> : null}
                          <InfoTooltip text="Define el día del mes en el que se espera el pago de este servicio." />
                        </span>
                        <input
                          value={initialServiceState.billingDay}
                          onChange={(event) =>
                            setInitialServiceState((prev) => ({
                              ...prev,
                              billingDay: event.target.value,
                            }))
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
                          placeholder="Día 1 por defecto"
                        />
                        <span className="text-[11px] text-slate-500">
                          El sistema asigna el día 1 automáticamente. Ajusta este valor si el cliente paga en otra fecha.
                        </span>
                        {initialServiceErrors.billingDay && (
                          <span className="text-xs font-medium text-red-600">{initialServiceErrors.billingDay}</span>
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
                            setInitialServiceState((prev) => ({
                              ...prev,
                              status: event.target.value,
                            }))
                          }
                          className={`rounded-md border px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${
                            initialServiceErrors.status
                              ? 'border-red-400 focus-visible-border-red-400 focus-visible:ring-red-200'
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
                          <span className="text-xs font-medium text-red-600">{initialServiceErrors.status}</span>
                        )}
                      </label>

                      <label className="md:col-span-2">
                        <span className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                          Notas del servicio
                          <InfoTooltip text="Agrega detalles como velocidad, equipo instalado o particularidades de cobro." />
                        </span>
                        <textarea
                          value={initialServiceState.notes}
                          onChange={(event) =>
                            setInitialServiceState((prev) => ({
                              ...prev,
                              notes: event.target.value,
                            }))
                          }
                          rows={2}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200"
                          placeholder="Ej. Plan de 20 Mbps con renta de router incluida"
                        />
                      </label>
                    </>
                  ) : (
                    <div className="md:col-span-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500">
                      Selecciona un plan para ver sus características y configurar la tarifa.
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-500">
                  ¿Necesitas crear o modificar planes?{' '}
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
            )}

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                className="border border-slate-200 bg-white text-slate-700 hover:border-blue-200"
                onClick={() => {
                  setFormState({ ...defaultForm })
                  setFormErrors({})
                  setInitialServiceState(createInitialServiceState(defaultForm.zoneId))
                  setInitialServiceErrors({})
                  setIsPrimaryServiceFormVisible(false)
                  setPendingExtraServicePlans([])
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

            {hasSelectedClients && activeClientsSubTab === 'list' ? (
              <div className="flex flex-col gap-3 rounded-md border border-blue-200 bg-blue-50/80 p-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
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
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Acciones
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleViewSelectedClientInfo}
                    disabled={!isSingleSelection || isMutatingClients}
                  >
                    Ver detalles
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleManageSelectedClientServices}
                    disabled={!isSingleSelection || isMutatingClients}
                  >
                    Gestionar servicios
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleActivateSelection}
                    disabled={!canActivateSelection || isMutatingClients || isProcessingSelectionAction}
                  >
                    Activar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleSuspendSelection}
                    disabled={!canSuspendSelection || isMutatingClients || isProcessingSelectionAction}
                  >
                    Suspender
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleOpenBulkAssign}
                    disabled={!isMultiSelection || isProcessingBulkAssign}
                  >
                    {isProcessingBulkAssign
                      ? 'Preparando…'
                      : `Cambios masivos${isMultiSelection ? ` (${selectedClientsCount})` : ''}`}
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
                    className="border border-transparent text-slate-600 hover:border-slate-200"
                    onClick={handleClearSelection}
                  >
                    Limpiar selección
                  </Button>
                </div>
              </div>
            ) : null}

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
                        <th scope="col" className="px-3 py-2 font-medium">
                          Tipo
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
                          Zona
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Servicios activos
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Pago mensual
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Deuda
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
                          const effective = parseNumberOrNull(
                            primaryServiceForRow?.effectivePrice ?? primaryServiceForRow?.price,
                          )
                          if (effective !== null && effective > 0) {
                            return effective
                          }
                          const mappedFee = parseNumberOrNull(client.monthlyFee)
                          if (mappedFee !== null && mappedFee > 0) {
                            return mappedFee
                          }
                          if (effective !== null) {
                            return effective
                          }
                          if (mappedFee !== null) {
                            return mappedFee
                          }
                          return null
                        })()
                        const clientServices = Array.isArray(client.services) ? client.services : []
                        const activeServiceNames = clientServices
                          .filter((service) => service?.status === 'active')
                          .map((service) => service?.name ?? service?.plan?.name ?? 'Servicio')
                        const inactiveServiceNames = clientServices
                          .filter((service) => service?.status && service.status !== 'active')
                          .map((service) => service?.name ?? service?.plan?.name ?? 'Servicio')
                        const serviceSummary =
                          activeServiceNames.length > 0
                            ? activeServiceNames.join(', ')
                            : 'Sin servicios activos'
                        const zoneLabel = (() => {
                          if (client.zoneName) {
                            return client.zoneName
                          }
                          if (client.zoneCode) {
                            return client.zoneCode
                          }
                          if (client.zoneId) {
                            return `Zona ${client.zoneId}`
                          }
                          if (client.base) {
                            return `Zona ${client.base}`
                          }
                          return '—'
                        })()
                        const clientTypeLabel = CLIENT_TYPE_LABELS[client.type] ?? 'Cliente'

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
                              <button
                                type="button"
                                onClick={() => handleToggleClientDetails(clientRowId)}
                                className="text-left font-semibold text-slate-900 transition hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                              >
                                {client.name}
                              </button>
                              <span className="block text-xs text-slate-500">{clientTypeLabel}</span>
                            </td>
                            <td className="px-3 py-2 text-slate-600">{clientTypeLabel}</td>
                            <td className="px-3 py-2 text-slate-600">{client.location || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{zoneLabel}</td>
                            <td className="px-3 py-2 text-slate-600">
                              <div className="flex flex-col gap-1 text-sm">
                                <span>{serviceSummary}</span>
                                {primaryServiceForRow ? (
                                  <span
                                    className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                                      isPrimaryActive
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-amber-50 text-amber-700'
                                    }`}
                                  >
                                    {primaryStatusForRow}
                                  </span>
                                ) : null}
                                {inactiveServiceNames.length > 0 ? (
                                  <span className="text-[11px] text-slate-500">
                                    Inactivos: {inactiveServiceNames.join(', ')}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {isCourtesyClient && clientServices.length > 0 ? (
                                <span className="font-semibold text-emerald-700">
                                  Servicio activo · {peso(0)} (cortesía)
                                </span>
                              ) : clientServices.length > 0 && primaryMonthlyFee !== null ? (
                                peso(Math.max(primaryMonthlyFee, 0))
                              ) : (
                                '—'
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
                  ) : primaryServicePrice !== null ? (
                    <>
                      <p className="text-base font-semibold text-slate-900">{peso(primaryServicePrice)}</p>
                      <p className="text-xs text-slate-500">
                        Adelantado: {formatPeriods(selectedClient.paidMonthsAhead)} periodo(s)
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-semibold text-slate-900">—</p>
                      <p className="text-xs text-slate-500">
                        Asigna un servicio para definir la tarifa mensual.
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
                        {selectedClient.debtMonths > 0 && primaryServicePrice !== null
                          ? peso(selectedClient.debtMonths * primaryServicePrice)
                          : 'Sin deuda'}
                      </p>
                      {selectedClient.debtMonths > 0 && primaryServicePrice !== null ? (
                        <p className="text-xs text-slate-500">
                          {formatPeriods(selectedClient.debtMonths)}{' '}
                          {isApproximatelyOne(selectedClient.debtMonths) ? 'periodo' : 'periodos'} pendientes
                        </p>
                      ) : null}
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
                            {getServiceTypeLabel(
                              selectedServicePlan.serviceType ??
                                selectedServicePlan.service_type ??
                                'internet',
                            )}
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
      <AssignExtraServicesModal
        isOpen={extraServicesModalState.isOpen}
        onClose={handleCloseExtraServicesModal}
        onApply={handleApplyExtraServices}
        isProcessing={isProcessingExtraServices}
        servicePlans={servicePlans}
        initialSelection={extraServicesModalState.selectedPlanIds}
        clientName={extraServicesModalState.clientName || 'cliente'}
        excludedPlanIds={extraServicesModalState.excludedPlanIds}
      />
    </div>
  )
}
