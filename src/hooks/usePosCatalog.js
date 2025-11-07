import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../services/apiClient.js'
import { queryKeys } from '../services/queryKeys.js'

const mapProduct = (item = {}) => ({
  id: item.id,
  sku: item.sku ?? '',
  name: item.name ?? '',
  category: item.category ?? '',
  description: item.description ?? '',
  unitPrice: Number(item.unit_price ?? item.unitPrice ?? 0),
  stockQuantity:
    item.stock_quantity === null || item.stock_quantity === undefined
      ? null
      : Number(item.stock_quantity),
  isActive: item.is_active ?? item.isActive ?? true,
  updatedAt: item.updated_at ?? null,
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

export const usePosCatalog = ({ includeInactive = false } = {}) => {
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => queryKeys.posProducts({ includeInactive }),
    [includeInactive],
  )

  const fetchProducts = useCallback(async () => {
    const response = await apiClient.get('/sales/products', {
      query: { include_inactive: includeInactive ? 'true' : undefined },
    })
    return extractItems(response.data).map(mapProduct)
  }, [includeInactive])

  const { data, status, error, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: fetchProducts,
    staleTime: 30_000,
  })

  const invalidateCatalog = useCallback(() => {
    queryClient.invalidateQueries(queryKeys.posProducts({ includeInactive: false }))
    queryClient.invalidateQueries(queryKeys.posProducts({ includeInactive: true }))
  }, [queryClient])

  const createProduct = useCallback(
    async (payload) => {
      const response = await apiClient.post('/sales/products', payload)
      await invalidateCatalog()
      return mapProduct(response.data)
    },
    [invalidateCatalog],
  )

  const updateProduct = useCallback(
    async ({ productId, ...changes }) => {
      const response = await apiClient.patch(
        `/sales/products/${productId}`,
        changes,
      )
      await invalidateCatalog()
      return mapProduct(response.data)
    },
    [invalidateCatalog],
  )

  return {
    products: data ?? [],
    status,
    error,
    isLoading,
    isFetching,
    refetch,
    createProduct,
    updateProduct,
  }
}

export default usePosCatalog
