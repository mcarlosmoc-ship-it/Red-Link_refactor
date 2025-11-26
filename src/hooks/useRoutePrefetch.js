import { useCallback, useRef } from 'react'

export function useRoutePrefetch() {
  const prefetchedRoutes = useRef(new Set())

  return useCallback(async (loader, path) => {
    if (!loader || prefetchedRoutes.current.has(path)) return

    try {
      await loader()
      prefetchedRoutes.current.add(path)
    } catch (error) {
      console.error(`Failed to prefetch route ${path}`, error)
    }
  }, [])
}
