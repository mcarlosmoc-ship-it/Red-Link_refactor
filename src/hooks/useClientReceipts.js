import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../services/apiClient.js'
import { queryKeys } from '../services/queryKeys.js'
import { ApiError } from '../services/apiClient.js'

const extractReceiptItems = (payload) => {
  if (Array.isArray(payload?.items)) {
    return payload.items
  }
  if (Array.isArray(payload)) {
    return payload
  }
  return []
}

export const mapReceipt = (receipt = {}) => ({
  id: receipt.id ?? receipt.folio ?? receipt.receipt_number ?? receipt.ticket_number ?? receipt.number,
  folio: receipt.folio ?? receipt.receipt_number ?? receipt.ticket_number ?? receipt.number ?? '—',
  issuedAt:
    receipt.issued_at ??
    receipt.issuedAt ??
    receipt.created_at ??
    receipt.createdAt ??
    receipt.paid_on ??
    receipt.date ??
    null,
  method: receipt.method ?? receipt.payment_method ?? 'Efectivo',
  amount: Number.parseFloat(receipt.amount ?? receipt.total ?? 0) || 0,
  period: receipt.period_key ?? receipt.period ?? receipt.periodKey ?? null,
  serviceId: receipt.client_service_id ?? receipt.service_id ?? receipt.service?.id ?? null,
})

export const useClientReceipts = ({ clientId, limit = 6, enabled = true } = {}) => {
  const [isReceiptsSupported, setIsReceiptsSupported] = useState(true)
  const shouldFetch = Boolean(clientId) && enabled && isReceiptsSupported
  const queryKey = useMemo(() => queryKeys.clientReceipts({ clientId, limit }), [clientId, limit])

  const fetchReceipts = useCallback(async () => {
    try {
      const response = await apiClient.get('/payments', {
        query: { client_id: clientId, limit },
      })

      return extractReceiptItems(response.data?.items ?? response.data).map(mapReceipt)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setIsReceiptsSupported(false)
        return []
      }
      throw error
    }
  }, [clientId, limit])

  const { data, status, error, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: fetchReceipts,
    enabled: shouldFetch,
    staleTime: 10_000,
    retry: false,
  })

  return {
    receipts: data ?? [],
    status,
    error,
    isLoading,
    isFetching,
    refetch,
  }
}

export default useClientReceipts
