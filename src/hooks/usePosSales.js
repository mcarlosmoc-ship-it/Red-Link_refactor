import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../services/apiClient.js'
import { queryKeys } from '../services/queryKeys.js'
import { peso } from '../utils/formatters.js'

const mapSale = (sale = {}) => ({
  id: sale.id,
  ticketNumber: sale.ticket_number ?? sale.ticketNumber,
  soldAt: sale.sold_at ?? sale.soldAt,
  clientName: sale.client_name ?? sale.clientName ?? '',
  total: Number(sale.total ?? 0),
  subtotal: Number(sale.subtotal ?? 0),
  discountAmount: Number(sale.discount_amount ?? 0),
  taxAmount: Number(sale.tax_amount ?? 0),
  paymentMethod: sale.payment_method ?? sale.paymentMethod ?? 'Efectivo',
  notes: sale.notes ?? '',
  items: Array.isArray(sale.items)
    ? sale.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: Number(item.quantity ?? 0),
        unitPrice: Number(item.unit_price ?? 0),
        total: Number(item.total ?? 0),
      }))
    : [],
})

const extractItems = (payload) => {
  if (Array.isArray(payload?.items)) {
    return payload.items
  }
  if (Array.isArray(payload)) {
    return payload
  }
  return []
}

export const usePosSales = ({ limit = 10 } = {}) => {
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => queryKeys.posSales({ limit }), [limit])

  const fetchSales = useCallback(async () => {
    const response = await apiClient.get('/sales/transactions', {
      query: { limit },
    })
    return extractItems(response.data).map(mapSale)
  }, [limit])

  const { data, status, error, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: fetchSales,
    staleTime: 10_000,
  })

  const invalidateSales = useCallback(() => {
    queryClient.invalidateQueries(queryKeys.posSales({ limit }))
  }, [queryClient, limit])

  const recordSale = useCallback(
    async (payload) => {
      const response = await apiClient.post('/sales/transactions', payload)
      await invalidateSales()
      return mapSale(response.data)
    },
    [invalidateSales],
  )

  return {
    sales: data ?? [],
    status,
    error,
    isLoading,
    isFetching,
    refetch,
    recordSale,
  }
}

export const formatSaleTotal = (sale) => peso.format(sale.total ?? 0)

export default usePosSales
