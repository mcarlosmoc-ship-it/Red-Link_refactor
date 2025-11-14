import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60 * 1000,
      // Las recargas dependen del TTL y de acciones explícitas del backoffice;
      // evitamos refetches automáticos en foco o reconexión para reducir ruido
      // en la red y mantener el control en la UI.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
})

export default queryClient
