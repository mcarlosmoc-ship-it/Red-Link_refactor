import React, { useMemo, useState } from 'react'
import {
  BadgeCheck,
  ClipboardList,
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
import { useToast } from '../hooks/useToast.js'
import { peso } from '../utils/formatters.js'

const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Revendedor', 'Otro']

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

export default function PointOfSalePage() {
  const { products, isLoading: isLoadingProducts, createProduct } = usePosCatalog()
  const { sales, recordSale, isFetching: isFetchingSales } = usePosSales({ limit: 8 })
  const { showToast } = useToast()

  const [searchTerm, setSearchTerm] = useState('')
  const [cartItems, setCartItems] = useState([])
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0])
  const [clientName, setClientName] = useState('')
  const [notes, setNotes] = useState('')
  const [discount, setDiscount] = useState('')
  const [tax, setTax] = useState('')
  const [customItem, setCustomItem] = useState({ description: '', price: '', quantity: '1' })
  const [saleResult, setSaleResult] = useState(null)
  const [formError, setFormError] = useState(null)
  const [isSubmittingSale, setIsSubmittingSale] = useState(false)

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) {
      return products
    }
    return products.filter((product) => {
      const haystack = `${product.name} ${product.category} ${product.sku}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [products, searchTerm])

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
          type: 'catalog',
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

  const discountValue = useMemo(() => Math.max(normalizeNumericInput(discount, 0), 0), [discount])
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
        client_name: clientName.trim() || undefined,
        notes: notes.trim() || undefined,
        discount_amount: discountAmount || 0,
        tax_amount: taxAmount || 0,
        items: cartItems.map((item) => ({
          product_id: item.productId ?? undefined,
          description: item.productId ? undefined : item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
        })),
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

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-blue-600" aria-hidden />
            Punto de venta
          </h1>
          <p className="text-sm text-slate-600">
            Cobra artículos sueltos, gestiona ventas rápidas y mantén el control de tu inventario
            diario sin salir del backoffice.
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <section aria-labelledby="catalogo-venta" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por nombre, categoría o SKU"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSearchTerm('')}
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
            {!isLoadingProducts && filteredProducts.length === 0 && (
              <Card className="md:col-span-2 xl:col-span-3">
                <CardContent className="space-y-1 text-sm text-slate-500">
                  <p>No encontramos artículos que coincidan con tu búsqueda.</p>
                  <p className="text-xs">Agrega uno personalizado para venderlo al instante.</p>
                </CardContent>
              </Card>
            )}
            {filteredProducts.map((product) => (
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
              <div className="flex items-center justify-between">
                <h2 id="carrito-venta" className="text-lg font-semibold text-slate-900">
                  Carrito de venta
                </h2>
                <span className="text-xs text-slate-500">{cartItems.length} artículos</span>
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
                          <p className="font-medium text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-500">{item.category}</p>
                          <p className="text-xs text-slate-400">
                            Precio unitario: <strong>{peso(item.unitPrice)}</strong>
                          </p>
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
                            className="h-8 w-20 rounded-md border border-slate-200 px-2 text-center text-sm"
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
                        <span className="font-semibold text-slate-900">
                          {peso(item.unitPrice * item.quantity)}
                        </span>
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
            <CardContent className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Artículo personalizado rápido</h3>
              <form className="grid gap-3" onSubmit={handleAddCustomItem}>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  Descripción
                  <input
                    type="text"
                    value={customItem.description}
                    onChange={(event) =>
                      setCustomItem((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder="Ej. Libreta profesional"
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                <h3 className="text-sm font-semibold text-slate-900">
                  Última venta registrada
                </h3>
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
          {isFetchingSales ? (
            <span className="text-xs text-slate-500">Actualizando…</span>
          ) : null}
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
    </div>
  )
}
