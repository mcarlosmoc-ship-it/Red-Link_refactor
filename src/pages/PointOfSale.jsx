/* global Blob, URL */
import React, { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  Box,
  ClipboardList,
  AlertTriangle,
  Download,
  Minus,
  PackagePlus,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
} from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { usePosCatalog } from '../hooks/usePosCatalog.js'
import { usePosSales } from '../hooks/usePosSales.js'
import { useClients } from '../hooks/useClients.js'
import { useServicePlans } from '../hooks/useServicePlans.js'
import { useClientServices } from '../hooks/useClientServices.js'
import { useToast } from '../hooks/useToast.js'
import { getClientDebtSummary, getClientMonthlyFee, getPrimaryService } from '../features/clients/utils.js'
import { CLIENT_PRICE, useBackofficeStore } from '../store/useBackofficeStore.js'
import { peso } from '../utils/formatters.js'

const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Revendedor', 'Otro']

const MAIN_TABS = [
  { id: 'ventas', label: 'Ventas', icon: ShoppingCart },
  { id: 'productos', label: 'Productos', icon: Box },
]

const PRODUCT_SUB_TABS = [
  { id: 'nuevo', label: 'Nuevo' },
  { id: 'importar', label: 'Importar' },
  { id: 'catalogo', label: 'Catálogo' },
]

const PRODUCT_IMPORT_TEMPLATE_HEADERS = [
  'codigo',
  'descripcion',
  'precio_costo',
  'precio_venta',
  'precio_mayoreo',
  'existencia',
  'inventario_minimo',
  'inventario_maximo',
  'clave_producto',
]

const INITIAL_NEW_PRODUCT_FORM = {
  code: '',
  description: '',
  costPrice: '',
  salePrice: '',
  wholesalePrice: '',
  stock: '',
  minInventory: '',
  maxInventory: '',
  productKey: '',
  usesInventory: true,
}

const formatDateTime = (value) => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const generateLineId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const normalizeNumericInput = (value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

const clamp = (value, min = 0, max = Number.POSITIVE_INFINITY) =>
  Math.min(Math.max(value, min), max)

const parseOptionalNumber = (value) => {
  const parsed = normalizeNumericInput(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : undefined
}

const toInputValue = (value, decimals = 2) => {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    return ''
  }
  return numericValue.toFixed(decimals)
}

export default function PointOfSalePage() {
  const { products, isLoading: isLoadingProducts, createProduct } = usePosCatalog()
  const { sales, recordSale } = usePosSales({ limit: 8 })
  const { clients, isLoading: isLoadingClients } = useClients()
  const { servicePlans, isLoading: isLoadingPlans } = useServicePlans()
  const { clientServices, isLoading: isLoadingClientServices } = useClientServices()
  const recordPayment = useBackofficeStore((state) => state.recordPayment)
  const { showToast } = useToast()

  const [activeTab, setActiveTab] = useState('ventas')
  const [activeProductTab, setActiveProductTab] = useState('nuevo')
  const [salesSearchTerm, setSalesSearchTerm] = useState('')
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [cartItems, setCartItems] = useState([])
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0])
  const [clientName, setClientName] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [notes, setNotes] = useState('')
  const [discount, setDiscount] = useState('')
  const [tax, setTax] = useState('')
  const [customItem, setCustomItem] = useState({ description: '', price: '', quantity: '1' })
  const [saleResult, setSaleResult] = useState(null)
  const [formError, setFormError] = useState(null)
  const [isSubmittingSale, setIsSubmittingSale] = useState(false)
  const [newProductForm, setNewProductForm] = useState(INITIAL_NEW_PRODUCT_FORM)
  const [newProductError, setNewProductError] = useState(null)
  const [isCreatingProduct, setIsCreatingProduct] = useState(false)
  const [paymentSearch, setPaymentSearch] = useState('')
  const [paymentClientId, setPaymentClientId] = useState('')
  const [paymentMonths, setPaymentMonths] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethodPos, setPaymentMethodPos] = useState(PAYMENT_METHODS[0])
  const [paymentNote, setPaymentNote] = useState('')
  const [isSubmittingClientPayment, setIsSubmittingClientPayment] = useState(false)
  const [ticketSearchTerm, setTicketSearchTerm] = useState('')

  const filteredSalesProducts = useMemo(() => {
    const term = salesSearchTerm.trim().toLowerCase()
    if (!term) {
      return products
    }
    return products.filter((product) => {
      const haystack = `${product.name} ${product.category} ${product.sku}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [products, salesSearchTerm])

  const filteredCatalogProducts = useMemo(() => {
    const term = productSearchTerm.trim().toLowerCase()
    if (!term) {
      return products
    }
    return products.filter((product) => {
      const haystack = `${product.name} ${product.category} ${product.sku}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [products, productSearchTerm])

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => a.name.localeCompare(b.name))
  }, [clients])

  const selectedClient = useMemo(
    () => sortedClients.find((client) => String(client.id) === String(selectedClientId)) ?? null,
    [selectedClientId, sortedClients],
  )

  const filteredClients = useMemo(() => {
    const term = paymentSearch.trim().toLowerCase()
    if (!term) {
      return sortedClients
    }
    return sortedClients.filter((client) => {
      const haystack = `${client.name} ${client.location ?? ''}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [paymentSearch, sortedClients])

  const clientOptions = useMemo(() => filteredClients.slice(0, 40), [filteredClients])

  const selectedPaymentClient = useMemo(
    () => sortedClients.find((client) => String(client.id) === String(paymentClientId)) ?? null,
    [paymentClientId, sortedClients],
  )

  const selectedPaymentService = useMemo(
    () => (selectedPaymentClient ? getPrimaryService(selectedPaymentClient) : null),
    [selectedPaymentClient],
  )

  const selectedPaymentDebt = useMemo(
    () => (selectedPaymentClient ? getClientDebtSummary(selectedPaymentClient, CLIENT_PRICE) : null),
    [selectedPaymentClient],
  )

  const selectedPaymentMonthlyFee = useMemo(
    () => (selectedPaymentClient ? getClientMonthlyFee(selectedPaymentClient, CLIENT_PRICE) : CLIENT_PRICE),
    [selectedPaymentClient],
  )

  useEffect(() => {
    if (!selectedPaymentClient) {
      setPaymentMonths('')
      setPaymentAmount('')
      setPaymentNote('')
      return
    }

    const baseMonths = selectedPaymentDebt?.debtMonths > 0 ? selectedPaymentDebt.debtMonths : 1
    const baseAmount =
      selectedPaymentDebt?.totalDue && selectedPaymentDebt.totalDue > 0
        ? selectedPaymentDebt.totalDue
        : selectedPaymentMonthlyFee

    setPaymentMonths(toInputValue(baseMonths, 2))
    setPaymentAmount(toInputValue(baseAmount, 2))
    setPaymentNote('')
  }, [selectedPaymentClient, selectedPaymentDebt, selectedPaymentMonthlyFee])

  useEffect(() => {
    if (selectedClient && !clientName.trim()) {
      setClientName(selectedClient.name)
    }
  }, [clientName, selectedClient])

  useEffect(() => {
    setCartItems((current) =>
      current.map((item) =>
        item.type === 'punctual-service' || item.type === 'monthly-service'
          ? { ...item, clientId: selectedClient ? selectedClient.id : null }
          : item,
      ),
    )
  }, [selectedClient])

  const addProductToCart = (product) => {
    setCartItems((current) => {
      const existing = current.find((item) => item.productId === product.id)
      if (existing) {
        return current.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: clamp(item.quantity + 1, 0.01) }
            : item,
        )
      }
      return [
        ...current,
        {
          id: generateLineId(),
          productId: product.id,
          name: product.name,
          category: product.category,
          unitPrice: product.unitPrice,
          quantity: 1,
          type: 'product',
        },
      ]
    })
  }

  const updateItemQuantity = (lineId, delta) => {
    setCartItems((current) =>
      current
        .map((item) =>
          item.id === lineId
            ? { ...item, quantity: clamp(item.quantity + delta, 0.01) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }

  const setItemQuantity = (lineId, value) => {
    const parsed = clamp(normalizeNumericInput(value, 0), 0.01)
    setCartItems((current) =>
      current
        .map((item) => (item.id === lineId ? { ...item, quantity: parsed } : item))
        .filter((item) => item.quantity > 0),
    )
  }

  const removeItem = (lineId) => {
    setCartItems((current) => current.filter((item) => item.id !== lineId))
  }

  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cartItems],
  )

  const discountValue = useMemo(
    () => Math.max(normalizeNumericInput(discount, 0), 0),
    [discount],
  )
  const taxValue = useMemo(() => Math.max(normalizeNumericInput(tax, 0), 0), [tax])
  const total = useMemo(() => clamp(subtotal - discountValue + taxValue, 0), [
    subtotal,
    discountValue,
    taxValue,
  ])

  const handleAddCustomItem = (event) => {
    event.preventDefault()
    const description = customItem.description.trim()
    const price = normalizeNumericInput(customItem.price, 0)
    const quantity = clamp(normalizeNumericInput(customItem.quantity, 1), 0.01)

    if (!description) {
      setFormError('Describe el artículo personalizado antes de agregarlo.')
      return
    }
    if (price <= 0) {
      setFormError('Ingresa un precio válido para el artículo personalizado.')
      return
    }

    setFormError(null)
    setCartItems((current) => [
      ...current,
      {
        id: generateLineId(),
        productId: null,
        name: description,
        category: 'Personalizado',
        unitPrice: price,
        quantity,
        type: 'custom',
      },
    ])
    setCustomItem({ description: '', price: '', quantity: '1' })
  }

  const punctualServices = useMemo(() => {
    return servicePlans
      .filter((plan) => {
        const category = (plan.serviceType ?? plan.category ?? '').toLowerCase()
        return category && !['internet', 'streaming', 'hotspot'].includes(category)
      })
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        category: plan.category ?? 'Servicio puntual',
        price: Number(plan.defaultMonthlyFee ?? plan.monthlyPrice ?? 0),
        plan,
      }))
  }, [servicePlans])

  const monthlyServices = useMemo(() => {
    return servicePlans
      .filter((plan) => {
        const category = (plan.serviceType ?? plan.category ?? '').toLowerCase()
        return !category || ['internet', 'streaming', 'hotspot'].includes(category)
      })
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        category: plan.category ?? 'Servicio mensual',
        price: Number(plan.defaultMonthlyFee ?? plan.monthlyPrice ?? 0),
        plan,
      }))
  }, [servicePlans])

  const searchableItems = useMemo(() => {
    const productEntries = products.map((product) => ({
      id: `product-${product.id}`,
      label: product.name,
      detail: product.category ?? '',
      price: product.unitPrice,
      type: 'product',
      product,
    }))

    const punctualEntries = punctualServices.map((service) => ({
      id: `punctual-${service.id}`,
      label: service.name,
      detail: service.category ?? 'Servicio puntual',
      price: service.price,
      type: 'punctual-service',
      service,
    }))

    const monthlyEntries = monthlyServices.map((service) => ({
      id: `monthly-${service.id}`,
      label: service.name,
      detail: service.category ?? 'Servicio mensual',
      price: service.price,
      type: 'monthly-service',
      service,
    }))

    return [...productEntries, ...punctualEntries, ...monthlyEntries]
  }, [monthlyServices, products, punctualServices])

  const filteredSearchItems = useMemo(() => {
    const term = ticketSearchTerm.trim().toLowerCase()
    if (!term) {
      return searchableItems.slice(0, 6)
    }
    return searchableItems
      .filter((item) =>
        `${item.label} ${item.detail}`.toLowerCase().includes(term),
      )
      .slice(0, 10)
  }, [searchableItems, ticketSearchTerm])

  const addSearchItemToCart = (entry) => {
    if (entry.type === 'product' && entry.product) {
      addProductToCart(entry.product)
      return
    }

    const baseItem = {
      id: generateLineId(),
      name: entry.label,
      category: entry.detail,
      unitPrice: entry.price,
      quantity: 1,
      productId: null,
    }

    if (entry.type === 'punctual-service') {
      setCartItems((current) => [
        ...current,
        {
          ...baseItem,
          type: 'punctual-service',
          clientId: selectedClient ? selectedClient.id : null,
          servicePlanId: entry.service?.id ?? null,
        },
      ])
      return
    }

    if (entry.type === 'monthly-service') {
      setCartItems((current) => [
        ...current,
        {
          ...baseItem,
          type: 'monthly-service',
          clientId: selectedClient ? selectedClient.id : null,
          servicePlanId: entry.service?.id ?? null,
        },
      ])
    }
  }

  const productLookup = useMemo(() => {
    const map = new Map()
    products.forEach((product) => {
      map.set(product.id, product)
    })
    return map
  }, [products])

  const clientServicesByClient = useMemo(() => {
    return clientServices.reduce((acc, service) => {
      const key = String(service.clientId ?? '')
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(service)
      return acc
    }, {})
  }, [clientServices])

  const cartValidation = useMemo(() => {
    const validation = {}
    cartItems.forEach((item) => {
      let message = ''
      if (item.type === 'product') {
        const product = productLookup.get(item.productId)
        if (product && product.stockQuantity !== null && item.quantity > product.stockQuantity) {
          message = `Stock insuficiente: quedan ${product.stockQuantity}`
        }
      }

      if (item.type === 'punctual-service') {
        if (!selectedClient) {
          message = 'Selecciona un cliente con instalación previa para validar este servicio.'
        } else {
          const services = clientServicesByClient[String(selectedClient.id)] ?? selectedClient.services ?? []
          const hasInstallation = services.some((service) => service.status === 'active')
          const hasCoverage = Boolean(selectedClient.zoneId || selectedClient.zone?.id)
          const alreadyAdded = cartItems.some(
            (other) => other.id !== item.id && other.type === 'punctual-service' && other.clientId === selectedClient.id,
          )

          if (!hasInstallation) {
            message = 'Este servicio requiere una instalación previa activa.'
          } else if (!hasCoverage) {
            message = 'No hay cobertura asignada para el cliente.'
          } else if (alreadyAdded) {
            message = 'Solo se puede agregar un servicio puntual por cliente.'
          }
        }
      }

      if (item.type === 'monthly-service') {
        if (!selectedClient) {
          message = 'Selecciona un cliente con contrato activo para continuar.'
        } else {
          const services = clientServicesByClient[String(selectedClient.id)] ?? selectedClient.services ?? []
          const activeContract = services.some((service) => service.status === 'active')
          if (!activeContract) {
            message = 'El cliente no tiene un contrato activo para facturar este servicio.'
          }
        }
      }

      if (message) {
        validation[item.id] = message
      }
    })
    return validation
  }, [cartItems, clientServicesByClient, productLookup, selectedClient])

  const handleCheckout = async (event) => {
    event.preventDefault()
    if (cartItems.length === 0) {
      setFormError('Agrega al menos un artículo antes de registrar la venta.')
      return
    }

    const discountAmount = discountValue
    const taxAmount = taxValue

    setIsSubmittingSale(true)
    setFormError(null)

    try {
      const payload = {
        payment_method: paymentMethod,
        client_name: clientName.trim() || selectedClient?.name || undefined,
        notes: notes.trim() || undefined,
        discount_amount: discountAmount || 0,
        tax_amount: taxAmount || 0,
        items: cartItems.map((item) => ({
          product_id: item.productId ?? undefined,
          description: item.productId ? undefined : `${item.name} (${item.category})`,
          quantity: item.quantity,
          unit_price: item.unitPrice,
        })),
      }

      const hasErrors = Object.keys(cartValidation).length > 0
      if (hasErrors) {
        setFormError('Revisa los artículos con alertas antes de registrar la venta.')
        setIsSubmittingSale(false)
        return
      }

      const sale = await recordSale(payload)
      setSaleResult(sale)
      setCartItems([])
      setDiscount('')
      setTax('')
      setNotes('')
      setClientName('')

      showToast({
        type: 'success',
        title: 'Venta registrada',
        description: `Ticket ${sale.ticketNumber ?? sale.ticket_number} guardado correctamente.`,
      })
    } catch (error) {
      const message = error?.message ?? 'No se pudo registrar la venta. Intenta nuevamente.'
      setFormError(message)
      showToast({
        type: 'error',
        title: 'No se pudo registrar la venta',
        description: message,
      })
    } finally {
      setIsSubmittingSale(false)
    }
  }

  const handleSubmitClientPayment = async (event) => {
    event.preventDefault()

    if (!selectedPaymentClient) {
      showToast({
        type: 'warning',
        title: 'Selecciona un cliente',
        description: 'Elige a quién registrar el pago desde el panel de punto de venta.',
      })
      return
    }

    if (!selectedPaymentService) {
      showToast({
        type: 'warning',
        title: 'Agrega un servicio al cliente',
        description: 'Asigna un servicio mensual al cliente para registrar pagos desde aquí.',
      })
      return
    }

    const amountValue = Number(paymentAmount)
    const monthsValue = Number(paymentMonths)
    const hasValidAmount = Number.isFinite(amountValue) && amountValue > 0
    const hasValidMonths = Number.isFinite(monthsValue) && monthsValue > 0

    if (!hasValidAmount && !hasValidMonths) {
      showToast({
        type: 'warning',
        title: 'Captura un monto o periodos',
        description: 'Ingresa el monto a pagar o los periodos que se cubrirán.',
      })
      return
    }

    const monthlyFee = selectedPaymentMonthlyFee > 0 ? selectedPaymentMonthlyFee : CLIENT_PRICE
    const monthsToRegister = hasValidMonths
      ? monthsValue
      : monthlyFee > 0
        ? amountValue / monthlyFee
        : 1
    const amountToRegister = hasValidAmount
      ? amountValue
      : monthsToRegister * selectedPaymentMonthlyFee

    setIsSubmittingClientPayment(true)
    try {
      await recordPayment({
        clientId: selectedPaymentClient.id,
        serviceId: selectedPaymentService.id,
        months: monthsToRegister,
        amount: amountToRegister,
        method: paymentMethodPos,
        note: paymentNote,
      })

      showToast({
        type: 'success',
        title: 'Pago registrado',
        description: `${selectedPaymentClient.name} quedó al día con un pago de ${peso(amountToRegister)}.`,
      })

      setPaymentAmount('')
      setPaymentMonths('')
      setPaymentNote('')
      setPaymentClientId('')
      setPaymentSearch('')
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo registrar el pago',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    } finally {
      setIsSubmittingClientPayment(false)
    }
  }

  const handleCreateQuickProduct = async () => {
    const description = customItem.description.trim()
    const price = normalizeNumericInput(customItem.price, 0)
    if (!description || price <= 0) {
      setFormError('Completa nombre y precio antes de guardar en catálogo.')
      return
    }

    try {
      await createProduct({
        name: description,
        category: 'General',
        unit_price: price,
      })
      showToast({
        type: 'success',
        title: 'Producto guardado',
        description: 'El artículo quedó disponible en el catálogo.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo guardar el producto',
        description: error?.message ?? 'Intenta nuevamente más tarde.',
      })
    }
  }

  const resetNewProductForm = () => {
    setNewProductForm(INITIAL_NEW_PRODUCT_FORM)
  }

  const handleDownloadTemplate = () => {
    const csvContent = `${PRODUCT_IMPORT_TEMPLATE_HEADERS.join(',')}` + '\n'
    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'plantilla_productos.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleNewProductChange = (field) => (event) => {
    const value = field === 'usesInventory' ? event.target.checked : event.target.value
    setNewProductForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCreateNewProduct = async (event) => {
    event.preventDefault()
    const description = newProductForm.description.trim()
    const salePrice = normalizeNumericInput(newProductForm.salePrice, Number.NaN)

    if (!description) {
      setNewProductError('Agrega una descripción para el producto.')
      return
    }

    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      setNewProductError('Define un precio de venta válido.')
      return
    }

    const payload = {
      name: description,
      description,
      sku: newProductForm.code.trim() || undefined,
      unit_price: salePrice,
      uses_inventory: newProductForm.usesInventory,
      product_key: newProductForm.productKey.trim() || undefined,
    }

    const costPrice = parseOptionalNumber(newProductForm.costPrice)
    if (costPrice !== undefined) {
      payload.cost_price = costPrice
    }

    const wholesalePrice = parseOptionalNumber(newProductForm.wholesalePrice)
    if (wholesalePrice !== undefined) {
      payload.wholesale_price = wholesalePrice
    }

    if (newProductForm.usesInventory) {
      const stockQuantity = parseOptionalNumber(newProductForm.stock)
      payload.stock_quantity = stockQuantity ?? 0

      const minInventory = parseOptionalNumber(newProductForm.minInventory)
      if (minInventory !== undefined) {
        payload.inventory_min = minInventory
      }

      const maxInventory = parseOptionalNumber(newProductForm.maxInventory)
      if (maxInventory !== undefined) {
        payload.inventory_max = maxInventory
      }
    } else {
      payload.stock_quantity = null
      payload.inventory_min = null
      payload.inventory_max = null
    }

    setIsCreatingProduct(true)
    setNewProductError(null)

    try {
      await createProduct(payload)
      showToast({
        type: 'success',
        title: 'Producto agregado',
        description: 'El artículo quedó disponible para tus ventas.',
      })
      resetNewProductForm()
    } catch (error) {
      const message = error?.message ?? 'No se pudo agregar el producto. Intenta más tarde.'
      setNewProductError(message)
      showToast({
        type: 'error',
        title: 'Error al crear el producto',
        description: message,
      })
    } finally {
      setIsCreatingProduct(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <ShoppingCart className="h-6 w-6 text-blue-600" aria-hidden />
          Punto de venta
        </h1>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {MAIN_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? 'border-blue-200 bg-blue-50 text-blue-600 shadow-sm'
                  : 'border-transparent bg-transparent text-slate-500 hover:text-slate-700'
              }`}
              aria-pressed={isActive}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {tab.label}
            </button>
          )
        })}
      </nav>

      {activeTab === 'ventas' ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
            <section aria-labelledby="catalogo-venta" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={salesSearchTerm}
                    onChange={(event) => setSalesSearchTerm(event.target.value)}
                    placeholder="Buscar por nombre, categoría o SKU"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setSalesSearchTerm('')}
                    className="text-xs"
                  >
                    Limpiar filtro
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {isLoadingProducts && (
                  <Card className="md:col-span-2 xl:col-span-3">
                    <CardContent className="flex items-center gap-3 text-sm text-slate-500">
                      <ShoppingBag className="h-4 w-4 animate-spin" aria-hidden />
                      Cargando catálogo…
                    </CardContent>
                  </Card>
                )}
                {!isLoadingProducts && filteredSalesProducts.length === 0 && (
                  <Card className="md:col-span-2 xl:col-span-3">
                    <CardContent className="space-y-1 text-sm text-slate-500">
                      <p>No encontramos artículos que coincidan con tu búsqueda.</p>
                      <p className="text-xs">Agrega uno personalizado para venderlo al instante.</p>
                    </CardContent>
                  </Card>
                )}
                {filteredSalesProducts.map((product) => (
                  <Card
                    key={product.id}
                    className="border border-slate-100 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                  >
                    <CardContent className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{product.name}</p>
                          <p className="text-xs text-slate-500">{product.category}</p>
                          {product.sku ? (
                            <p className="text-[11px] uppercase tracking-wide text-slate-400">
                              SKU {product.sku}
                            </p>
                          ) : null}
                        </div>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
                          {peso(product.unitPrice)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        {product.stockQuantity !== null ? (
                          <span>
                            Stock: <strong>{product.stockQuantity}</strong>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                            Stock ilimitado
                          </span>
                        )}
                        <span>{product.isActive ? 'Disponible' : 'Inactivo'}</span>
                      </div>
                      <Button
                        type="button"
                        className="w-full"
                        onClick={() => addProductToCart(product)}
                      >
                        <ShoppingBag className="mr-2 h-4 w-4" aria-hidden /> Agregar
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section aria-labelledby="carrito-venta" className="space-y-4">
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <h2 id="carrito-venta" className="text-lg font-semibold text-slate-900">
                        Carrito de venta
                      </h2>
                      <p className="text-xs text-slate-500">
                        Busca productos, servicios puntuales o mensuales desde aquí.
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">{cartItems.length} artículos</span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[2fr,1fr]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={ticketSearchTerm}
                        onChange={(event) => setTicketSearchTerm(event.target.value)}
                        placeholder="Escribe para agregar al ticket"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                      {filteredSearchItems.length > 0 && (
                        <ul className="absolute z-10 mt-2 w-full divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                          {filteredSearchItems.map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                onClick={() => addSearchItemToCart(item)}
                                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-slate-50"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-slate-900">{item.label}</span>
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                                        item.type === 'product'
                                          ? 'bg-blue-50 text-blue-700'
                                          : item.type === 'punctual-service'
                                            ? 'bg-amber-50 text-amber-700'
                                            : 'bg-emerald-50 text-emerald-700'
                                      }`}
                                    >
                                      {item.type === 'product'
                                        ? 'Producto'
                                        : item.type === 'punctual-service'
                                          ? 'Servicio puntual'
                                          : 'Servicio mensual'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-500">{item.detail || 'Sin categoría'}</p>
                                </div>
                                <span className="text-sm font-semibold text-slate-900">{peso(item.price)}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="grid gap-2 text-xs font-medium text-slate-600">
                      <label className="grid gap-1">
                        Cliente para validar servicios
                        <select
                          value={selectedClientId}
                          onChange={(event) => setSelectedClientId(event.target.value)}
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        >
                          <option value="">Sin seleccionar</option>
                          {sortedClients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name} {client.zoneName ? `· ${client.zoneName}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      {(isLoadingClients || isLoadingPlans || isLoadingClientServices) && (
                        <p className="text-[11px] text-slate-500">Validando datos de cliente y servicios…</p>
                      )}
                    </div>
                  </div>

                  {cartItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                      <ShoppingCart className="mx-auto mb-3 h-5 w-5 text-slate-400" aria-hidden />
                      Agrega productos del catálogo o registra un artículo personalizado.
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {cartItems.map((item) => (
                        <li key={item.id} className="rounded-lg border border-slate-100 p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-slate-900">{item.name}</p>
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                                    item.type === 'product'
                                      ? 'bg-blue-50 text-blue-700'
                                      : item.type === 'punctual-service'
                                        ? 'bg-amber-50 text-amber-700'
                                        : item.type === 'monthly-service'
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-slate-50 text-slate-600'
                                  }`}
                                >
                                  {item.type === 'product'
                                    ? 'Producto'
                                    : item.type === 'punctual-service'
                                      ? 'Servicio puntual'
                                      : item.type === 'monthly-service'
                                        ? 'Servicio mensual'
                                        : 'Personalizado'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500">{item.category}</p>
                              <p className="text-xs text-slate-400">
                                Precio unitario: <strong>{peso(item.unitPrice)}</strong>
                              </p>
                              {cartValidation[item.id] ? (
                                <p className="flex items-center gap-2 text-xs font-medium text-amber-700">
                                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                                  {cartValidation[item.id]}
                                </p>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-auto px-2 py-1 text-slate-400 hover:text-red-500"
                              onClick={() => removeItem(item.id)}
                              aria-label={`Eliminar ${item.name}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 w-8 p-0"
                                onClick={() => updateItemQuantity(item.id, -1)}
                                aria-label={`Reducir cantidad de ${item.name}`}
                              >
                                <Minus className="h-4 w-4" aria-hidden />
                              </Button>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.quantity}
                                onChange={(event) => setItemQuantity(item.id, event.target.value)}
                                className={`h-8 w-20 rounded-md border px-2 text-center text-sm ${
                                  cartValidation[item.id]
                                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                                    : 'border-slate-200'
                                }`}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 w-8 p-0"
                                onClick={() => updateItemQuantity(item.id, 1)}
                                aria-label={`Incrementar cantidad de ${item.name}`}
                              >
                                <Plus className="h-4 w-4" aria-hidden />
                              </Button>
                            </div>
                            <div className="text-right">
                              <p className="text-[11px] uppercase tracking-wide text-slate-400">Subtotal</p>
                              <span className="font-semibold text-slate-900">
                                {peso(item.unitPrice * item.quantity)}
                              </span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <form className="space-y-4" onSubmit={handleCheckout}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Cliente (opcional)
                        <input
                          type="text"
                          value={clientName}
                          onChange={(event) => setClientName(event.target.value)}
                          placeholder="Nombre para identificar la venta"
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Método de pago
                        <select
                          value={paymentMethod}
                          onChange={(event) => setPaymentMethod(event.target.value)}
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        >
                          {PAYMENT_METHODS.map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Descuento
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={discount}
                          onChange={(event) => setDiscount(event.target.value)}
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Impuestos
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={tax}
                          onChange={(event) => setTax(event.target.value)}
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                    </div>

                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Notas (opcional)
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={2}
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Anota detalles importantes del cobro"
                      />
                    </label>

                    <dl className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                      <div className="flex items-center justify-between">
                        <dt>Subtotal</dt>
                        <dd className="font-medium text-slate-900">{peso(subtotal)}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>Descuento</dt>
                        <dd className="font-medium text-slate-900">{peso(discountValue)}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>Impuestos</dt>
                        <dd className="font-medium text-slate-900">{peso(taxValue)}</dd>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base">
                        <dt className="font-semibold text-slate-900">Total a cobrar</dt>
                        <dd className="font-semibold text-blue-600">{peso(total)}</dd>
                      </div>
                    </dl>

                  {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

                  <Button type="submit" className="w-full" disabled={isSubmittingSale}>
                    <Receipt className="mr-2 h-4 w-4" aria-hidden /> Registrar cobro
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4">
                <header className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-900">Pagos rápidos de clientes</h2>
                  <p className="text-xs text-slate-500">
                    Cobra mensualidades de internet o servicios asociados sin salir del punto de venta.
                  </p>
                </header>

                <form className="space-y-4" onSubmit={handleSubmitClientPayment}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Buscar cliente
                      <input
                        type="search"
                        value={paymentSearch}
                        onChange={(event) => setPaymentSearch(event.target.value)}
                        placeholder="Nombre, ubicación o referencia"
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Cliente
                      <select
                        value={paymentClientId}
                        onChange={(event) => setPaymentClientId(event.target.value)}
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">Selecciona un cliente</option>
                        {clientOptions.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                      <span className="text-[11px] text-slate-400">
                        Mostrando {clientOptions.length} resultado(s) coincidentes.
                      </span>
                    </label>
                  </div>

                  {isLoadingClients ? (
                    <p className="text-sm text-slate-500">Cargando clientes…</p>
                  ) : selectedPaymentClient ? (
                    <div className="space-y-3">
                      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                        <p className="font-semibold text-slate-800">{selectedPaymentClient.name}</p>
                        <p className="text-xs text-slate-500">
                          Servicio: {selectedPaymentService?.name ?? 'Sin servicio configurado'} · Tarifa{' '}
                          {peso(selectedPaymentMonthlyFee)}
                        </p>
                        <p className="text-xs text-slate-500">
                          Adeudo estimado: {peso(selectedPaymentDebt?.totalDue ?? 0)} ({
                            toInputValue(selectedPaymentDebt?.debtMonths ?? 0, 2)
                          }{' '}
                          meses)
                        </p>
                        {!selectedPaymentService && (
                          <p className="mt-1 text-xs text-amber-600">
                            Asigna un servicio mensual para habilitar el cobro rápido.
                          </p>
                        )}
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="grid gap-1 text-xs font-medium text-slate-600">
                          Periodos a pagar
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={paymentMonths}
                            onChange={(event) => setPaymentMonths(event.target.value)}
                            className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            placeholder="Ej. 1"
                          />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600">
                          Monto a pagar
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={paymentAmount}
                            onChange={(event) => setPaymentAmount(event.target.value)}
                            className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            placeholder="Ej. 300"
                            required={!paymentMonths}
                          />
                        </label>
                      </div>

                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Método de pago
                        <select
                          value={paymentMethodPos}
                          onChange={(event) => setPaymentMethodPos(event.target.value)}
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        >
                          {PAYMENT_METHODS.map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Nota (opcional)
                        <textarea
                          value={paymentNote}
                          onChange={(event) => setPaymentNote(event.target.value)}
                          className="min-h-[60px] rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                          placeholder="Referencia rápida del pago"
                        />
                      </label>

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={!selectedPaymentService || isSubmittingClientPayment}
                      >
                        {isSubmittingClientPayment ? 'Registrando pago…' : 'Registrar pago'}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Selecciona un cliente para registrar cobros de servicios desde aquí.
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4">
                <header className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-900">Artículo personalizado</h2>
                    <p className="text-xs text-slate-500">
                      Registra un artículo rápido para esta venta y guárdalo si quieres usarlo después.
                    </p>
                  </header>

                  <form className="space-y-4" onSubmit={handleAddCustomItem}>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Descripción
                      <input
                        type="text"
                        value={customItem.description}
                        onChange={(event) =>
                          setCustomItem((prev) => ({ ...prev, description: event.target.value }))
                        }
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Nombre del artículo"
                      />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Precio
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={customItem.price}
                          onChange={(event) =>
                            setCustomItem((prev) => ({ ...prev, price: event.target.value }))
                          }
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Cantidad
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={customItem.quantity}
                          onChange={(event) =>
                            setCustomItem((prev) => ({ ...prev, quantity: event.target.value }))
                          }
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" variant="secondary" className="flex-1">
                        <PackagePlus className="mr-2 h-4 w-4" aria-hidden /> Agregar al carrito
                      </Button>
                      <Button type="button" variant="ghost" onClick={handleCreateQuickProduct}>
                        <ClipboardList className="mr-2 h-4 w-4" aria-hidden /> Guardar en catálogo
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {saleResult ? (
                <Card>
                  <CardContent className="space-y-2 text-sm text-slate-600">
                    <h3 className="text-sm font-semibold text-slate-900">Última venta registrada</h3>
                    <p>
                      Ticket <strong>{saleResult.ticketNumber ?? saleResult.ticket_number}</strong> ·{' '}
                      {formatDateTime(saleResult.soldAt ?? saleResult.sold_at)}
                    </p>
                    <p>Total cobrado: {peso(saleResult.total ?? 0)}</p>
                    <p className="text-xs text-slate-400">
                      Usa esta referencia para resolver dudas rápidas con el cliente.
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </section>
          </div>

          <section aria-labelledby="ventas-recientes" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="ventas-recientes" className="text-lg font-semibold text-slate-900">
                Ventas recientes
              </h2>
            </div>
            {sales.length === 0 ? (
              <Card>
                <CardContent className="flex items-center gap-3 text-sm text-slate-500">
                  <Receipt className="h-4 w-4 text-slate-400" aria-hidden />
                  Aún no registras ventas en el punto de venta.
                </CardContent>
              </Card>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-100">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">
                        Ticket
                      </th>
                      <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">
                        Cliente
                      </th>
                      <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">
                        Fecha
                      </th>
                      <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">
                        Método
                      </th>
                      <th scope="col" className="px-4 py-2 text-right font-medium text-slate-500">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {sales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-700">{sale.ticketNumber}</td>
                        <td className="px-4 py-2 text-slate-500">
                          {sale.clientName || 'Mostrador'}
                        </td>
                        <td className="px-4 py-2 text-slate-500">{formatDateTime(sale.soldAt)}</td>
                        <td className="px-4 py-2 text-slate-500">{sale.paymentMethod}</td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-900">
                          {peso(sale.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="space-y-6">
          <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
            {PRODUCT_SUB_TABS.map((tab) => {
              const isActive = activeProductTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveProductTab(tab.id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  aria-pressed={isActive}
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>

          {activeProductTab === 'nuevo' ? (
            <Card>
              <CardContent className="space-y-6">
                <header className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-900">Agregar producto</h2>
                  <p className="text-sm text-slate-500">
                    Completa los siguientes datos para registrar un nuevo artículo en tu catálogo.
                  </p>
                </header>

                <form className="grid gap-4" onSubmit={handleCreateNewProduct}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Código
                      <input
                        type="text"
                        value={newProductForm.code}
                        onChange={handleNewProductChange('code')}
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Identificador interno o SKU"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Clave producto
                      <input
                        type="text"
                        value={newProductForm.productKey}
                        onChange={handleNewProductChange('productKey')}
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Clave SAT u otra referencia"
                      />
                    </label>
                  </div>

                  <label className="grid gap-1 text-xs font-medium text-slate-600 md:col-span-2">
                    Descripción
                    <input
                      type="text"
                      value={newProductForm.description}
                      onChange={handleNewProductChange('description')}
                      className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      placeholder="Nombre con el que identificarás el artículo"
                    />
                  </label>

                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Precio costo
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newProductForm.costPrice}
                        onChange={handleNewProductChange('costPrice')}
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Precio venta
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newProductForm.salePrice}
                        onChange={handleNewProductChange('salePrice')}
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        required
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-slate-600">
                      Precio mayoreo
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newProductForm.wholesalePrice}
                        onChange={handleNewProductChange('wholesalePrice')}
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                  </div>

                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={newProductForm.usesInventory}
                      onChange={handleNewProductChange('usesInventory')}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                    />
                    Usa control de inventario
                  </label>

                  {newProductForm.usesInventory ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Existencia
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newProductForm.stock}
                          onChange={handleNewProductChange('stock')}
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Inventario mínimo
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newProductForm.minInventory}
                          onChange={handleNewProductChange('minInventory')}
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Inventario máximo
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newProductForm.maxInventory}
                          onChange={handleNewProductChange('maxInventory')}
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                    </div>
                  ) : null}

                  {newProductError ? (
                    <p className="text-sm text-red-600">{newProductError}</p>
                  ) : null}

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={resetNewProductForm}>
                      Limpiar
                    </Button>
                    <Button type="submit" disabled={isCreatingProduct}>
                      Guardar producto
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : activeProductTab === 'importar' ? (
            <Card>
              <CardContent className="space-y-6">
                <header className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-900">Importar catálogo</h2>
                  <p className="text-sm text-slate-500">
                    Sigue estos pasos para cargar tus productos desde un archivo CSV.
                  </p>
                </header>

                <ol className="space-y-2 text-sm text-slate-600 list-decimal list-inside">
                  <li>Descarga la plantilla de ejemplo y llena una fila por cada producto.</li>
                  <li>Respeta los encabezados y guarda el archivo en formato CSV.</li>
                  <li>Regresa a esta pantalla cuando quieras subir tu inventario.</li>
                </ol>

                <div className="space-y-2 text-sm text-slate-500">
                  <p className="font-medium text-slate-700">Campos incluidos en la plantilla:</p>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {PRODUCT_IMPORT_TEMPLATE_HEADERS.map((header) => (
                      <li key={header} className="capitalize">
                        {header.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={handleDownloadTemplate}>
                    <Download className="mr-2 h-4 w-4" aria-hidden /> Descargar plantilla CSV
                  </Button>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                    Importación disponible próximamente
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-slate-900">Catálogo de productos</h2>
                    <p className="text-sm text-slate-500">
                      Consulta el estado general de tu inventario en un solo lugar.
                    </p>
                  </div>
                  <div className="relative w-full max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={productSearchTerm}
                      onChange={(event) => setProductSearchTerm(event.target.value)}
                      placeholder="Buscar producto"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                {filteredCatalogProducts.length === 0 ? (
                  <Card className="border border-dashed border-slate-200">
                    <CardContent className="text-sm text-slate-500">
                      Aún no hay productos que coincidan con tu búsqueda.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">
                            Código
                          </th>
                          <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">
                            Descripción
                          </th>
                          <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">
                            Precio venta
                          </th>
                          <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">
                            Stock
                          </th>
                          <th scope="col" className="px-4 py-2 text-left font-medium text-slate-500">
                            Actualizado
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredCatalogProducts.map((product) => (
                          <tr key={product.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-slate-500">{product.sku || '—'}</td>
                            <td className="px-4 py-2 text-slate-700">
                              <div className="font-medium text-slate-900">{product.name}</div>
                              <div className="text-xs text-slate-500">{product.category}</div>
                            </td>
                            <td className="px-4 py-2 text-slate-500">{peso(product.unitPrice)}</td>
                            <td className="px-4 py-2 text-slate-500">
                              {product.stockQuantity === null ? 'Sin control' : product.stockQuantity}
                            </td>
                            <td className="px-4 py-2 text-slate-500">
                              {product.updatedAt ? formatDateTime(product.updatedAt) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
