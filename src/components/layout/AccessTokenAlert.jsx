import React, { useEffect, useMemo, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useBackofficeStore } from '../../store/useBackofficeStore.js'
import { apiClient, subscribeToAccessToken } from '../../services/apiClient.js'

const RESOURCE_LABELS = {
  clients: 'Sincronizar la lista de clientes',
  principalAccounts: 'Consultar cuentas principales',
  clientAccounts: 'Consultar cuentas de clientes',
  payments: 'Registrar y consultar pagos',
  resellers: 'Cargar el listado de revendedores',
  expenses: 'Registrar gastos operativos',
  inventory: 'Gestionar el inventario de equipos',
  metrics: 'Calcular las métricas del tablero',
  initialize: 'Inicializar el panel de control',
}

const uniqueValues = (values) => Array.from(new Set(values.filter(Boolean)))

const hasReadableToken = (token) => {
  if (typeof token !== 'string') {
    return false
  }
  return Boolean(token.trim())
}

export function AccessTokenAlert() {
  const status = useBackofficeStore((state) => state.status)
  const unauthorizedResources = useMemo(
    () =>
      Object.entries(status ?? {})
        .filter(([, resourceStatus]) => resourceStatus?.errorCode === 401)
        .map(([resource]) => resource),
    [status],
  )

  const [hasToken, setHasToken] = useState(() => hasReadableToken(apiClient.getAccessToken()))

  useEffect(() => {
    const unsubscribe = subscribeToAccessToken((token) => {
      setHasToken(hasReadableToken(token))
    })
    return unsubscribe
  }, [])

  if (hasToken && unauthorizedResources.length === 0) {
    return null
  }

  const impactedActions = uniqueValues(
    unauthorizedResources.map((resource) => RESOURCE_LABELS[resource] ?? null),
  )

  return (
    <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/95 p-5 text-sm text-amber-900 shadow-sm shadow-amber-200/40">
      <div className="flex items-start gap-4">
        <div className="hidden sm:block">
          <ShieldAlert aria-hidden className="h-7 w-7 text-amber-500" />
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <ShieldAlert aria-hidden className="h-5 w-5 text-amber-500 sm:hidden" />
            <span>Conecta el panel a tu backend</span>
          </div>
          <p className="text-sm text-amber-900">
            La API está rechazando las solicitudes con código <strong>401</strong>. Configura un token válido para poder
            sincronizar los datos del panel.
          </p>
          {impactedActions.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
              {impactedActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          ) : null}
          <div className="space-y-2 text-xs text-amber-800">
            <p>
              Puedes definir la variable <code>VITE_API_ACCESS_TOKEN</code> en tu archivo <code>.env.local</code> o
              ejecutar el siguiente comando en la consola del navegador:
            </p>
            <pre className="overflow-x-auto rounded-lg bg-white/80 p-3 font-mono text-[11px] leading-5 text-slate-700 shadow-inner">
              <code>window.__RED_LINK_API_CLIENT__.setAccessToken('tu-token')</code>
            </pre>
            <p>
              El token debe ser emitido por el endpoint <code>POST /auth/token</code> del backend. Una vez configurado,
              vuelve a presionar “Actualizar datos”.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default AccessTokenAlert
