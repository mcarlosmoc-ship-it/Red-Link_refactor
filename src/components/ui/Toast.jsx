import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

const DEFAULT_TOAST_DURATION = 5000

const ToastContext = createContext(null)

const createToast = (options) => {
  const id = options.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return {
    id,
    type: options.type ?? 'info',
    title: options.title ?? '',
    description: options.description ?? '',
    duration: typeof options.duration === 'number' ? options.duration : DEFAULT_TOAST_DURATION,
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

  const removeToast = useCallback((toastId) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== toastId))
    const timer = timersRef.current.get(toastId)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(toastId)
    }
  }, [])

  const showToast = useCallback(
    (options) => {
      const toast = createToast(options ?? {})
      setToasts((prev) => [...prev, toast])

      if (toast.duration > 0) {
        const timer = setTimeout(() => {
          removeToast(toast.id)
        }, toast.duration)
        timersRef.current.set(toast.id, timer)
      }

      return toast.id
    },
    [removeToast],
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
