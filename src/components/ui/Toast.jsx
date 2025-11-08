import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

const DEFAULT_TOAST_DURATION = 5000

const ToastContext = createContext(null)

const resolveDedupeKey = (options) => {
  if (options?.dedupeKey !== undefined) {
    return options.dedupeKey
  }

  const type = options?.type ?? 'info'
  const description = options?.description

  if (!description) {
    return null
  }

  return `${type}|${description}`
}

const createToast = (options) => {
  const id = options.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const duration =
    typeof options.duration === 'number' ? options.duration : DEFAULT_TOAST_DURATION
  return {
    id,
    type: options.type ?? 'info',
    title: options.title ?? '',
    description: options.description ?? '',
    duration,
    dedupeKey: resolveDedupeKey(options),
  }
}

const toastStylesByType = {
  info: 'border-slate-200 bg-white text-slate-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef(new Map())
  const dedupeIndexRef = useRef(new Map())
  const dedupeKeyByIdRef = useRef(new Map())

  const removeToast = useCallback((toastId) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== toastId))

    const timer = timersRef.current.get(toastId)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(toastId)
    }

    const dedupeKey = dedupeKeyByIdRef.current.get(toastId)
    if (dedupeKey) {
      dedupeKeyByIdRef.current.delete(toastId)
      if (dedupeIndexRef.current.get(dedupeKey) === toastId) {
        dedupeIndexRef.current.delete(dedupeKey)
      }
    }
  }, [])

  const registerTimer = useCallback(
    (toastId, duration) => {
      if (duration <= 0) return

      const timer = setTimeout(() => {
        removeToast(toastId)
      }, duration)
      timersRef.current.set(toastId, timer)
    },
    [removeToast],
  )

  const showToast = useCallback(
    (options) => {
      const resolvedOptions = options ?? {}
      const tentativeToast = createToast(resolvedOptions)
      const { dedupeKey } = tentativeToast

      if (dedupeKey) {
        const existingId = dedupeIndexRef.current.get(dedupeKey)
        if (existingId) {
          setToasts((prev) =>
            prev.map((toast) =>
              toast.id === existingId
                ? {
                    ...toast,
                    type: tentativeToast.type,
                    title: tentativeToast.title,
                    description: tentativeToast.description,
                    duration: tentativeToast.duration,
                    dedupeKey,
                  }
                : toast,
            ),
          )

          const existingTimer = timersRef.current.get(existingId)
          if (existingTimer) {
            clearTimeout(existingTimer)
            timersRef.current.delete(existingId)
          }

          dedupeKeyByIdRef.current.set(existingId, dedupeKey)
          registerTimer(existingId, tentativeToast.duration)
          return existingId
        }
      }

      const toast = tentativeToast
      setToasts((prev) => [...prev, toast])

      if (toast.dedupeKey) {
        dedupeIndexRef.current.set(toast.dedupeKey, toast.id)
        dedupeKeyByIdRef.current.set(toast.id, toast.dedupeKey)
      }

      registerTimer(toast.id, toast.duration)

      return toast.id
    },
    [registerTimer],
  )

  const contextValue = useMemo(
    () => ({
      showToast,
      dismissToast: removeToast,
    }),
    [showToast, removeToast],
  )

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => clearTimeout(timer))
      timersRef.current.clear()
    },
    [],
  )

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-full max-w-xs flex-col gap-3 sm:max-w-sm">
        {toasts.map((toast) => {
          const tone = toastStylesByType[toast.type] ?? toastStylesByType.info
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg transition hover:shadow-xl ${tone}`}
            >
              <div className="flex-1">
                {toast.title && <p className="text-sm font-semibold">{toast.title}</p>}
                {toast.description && <p className="mt-1 text-sm opacity-90">{toast.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="rounded-full p-1 text-current opacity-60 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                aria-label="Cerrar notificación"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const ToastConsumer = ToastContext.Consumer

export const useToastContext = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToastContext must be used within a ToastProvider')
  }
  return context
}
