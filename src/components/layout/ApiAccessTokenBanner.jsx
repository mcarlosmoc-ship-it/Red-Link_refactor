import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyRound, ShieldAlert, LogIn } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useBackofficeStore } from '../../store/useBackofficeStore.js'
import { ApiError, apiClient, subscribeToAccessToken } from '../../services/apiClient.js'
import { useToast } from '../../hooks/useToast.js'

const RESOURCE_ACTIONS = {
  clients: 'Agregar o sincronizar clientes',
  clientAccounts: 'Sincronizar cuentas asociadas a clientes',
  principalAccounts: 'Sincronizar cuentas principales',
  payments: 'Consultar y registrar pagos',
  resellers: 'Guardar revendedores',
  expenses: 'Registrar gastos operativos',
  inventory: 'Registrar equipos en el inventario',
  metrics: 'Calcular las métricas del tablero',
  initialize: 'Inicializar el panel de control',
}

const DEFAULT_ACTIONS = [
  'Agregar nuevos clientes',
  'Importar tu cartera de clientes',
  'Guardar revendedores y sus cambios',
  'Registrar gastos y comprobantes',
  'Registrar equipos dentro del inventario',
]

const normalizeDraftValue = (value) => {
  if (typeof value === 'string') {
    return value
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

const uniqueValues = (values) => Array.from(new Set(values.filter(Boolean)))

const extractTokenFromResponse = (data) => {
  if (!data || typeof data !== 'object') {
    return null
  }

  const candidateKeys = ['access_token', 'accessToken', 'token']
  for (const key of candidateKeys) {
    const value = data[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) {
        return trimmed
      }
    }
  }

  return null
}

export function ApiAccessTokenBanner() {
  const { status, clearResourceError } = useBackofficeStore((state) => ({
    status: state.status,
    clearResourceError: state.clearResourceError,
  }))
  const unauthorizedResources = useMemo(
    () =>
      Object.entries(status ?? {})
        .filter(([, resourceStatus]) => resourceStatus?.errorCode === 401)
        .map(([resource]) => resource),
    [status],
  )

  const { showToast } = useToast()
  const [currentToken, setCurrentToken] = useState(() => normalizeDraftValue(apiClient.getAccessToken()))
  const [tokenDraft, setTokenDraft] = useState(() => normalizeDraftValue(apiClient.getAccessToken()))
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isRequestingToken, setIsRequestingToken] = useState(false)
  const [requestError, setRequestError] = useState(null)

  useEffect(() => {
    const unsubscribe = subscribeToAccessToken((token) => {
      const normalized = normalizeDraftValue(token)
      setCurrentToken(normalized)
      setTokenDraft(normalized)
      setRequestError(null)
      setIsRequestingToken(false)
      setPassword('')
    })
    return unsubscribe
  }, [])

  const hasUnauthorized = unauthorizedResources.length > 0
  const normalizedCurrentToken = normalizeDraftValue(currentToken).trim()
  const trimmedDraft = normalizeDraftValue(tokenDraft).trim()
  const shouldShowBanner = hasUnauthorized || !normalizedCurrentToken

  const actionsFromErrors = useMemo(() => {
    const labels = unauthorizedResources.map((resource) => RESOURCE_ACTIONS[resource] ?? null)
    return uniqueValues(labels)
  }, [unauthorizedResources])

  const actionsToShow = actionsFromErrors.length > 0 ? actionsFromErrors : DEFAULT_ACTIONS
  const canSave = trimmedDraft.length > 0 && trimmedDraft !== normalizedCurrentToken
  const canClear = Boolean(normalizedCurrentToken)
  const trimmedUsername = username.trim()
  const canRequestToken = trimmedUsername.length > 0 && password.length > 0 && !isRequestingToken

  const clearUnauthorizedErrors = useCallback(() => {
    unauthorizedResources.forEach((resource) => {
      clearResourceError(resource)
    })
  }, [unauthorizedResources, clearResourceError])

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault()
      if (!canSave) {
        return
      }
      const savedToken = apiClient.setAccessToken(trimmedDraft, { persist: true }) ?? ''
      setCurrentToken(savedToken)
      setTokenDraft(savedToken)
      setRequestError(null)
      clearUnauthorizedErrors()
      showToast({
        type: 'success',
        title: 'Token actualizado',
        description: 'Vuelve a sincronizar los datos para reintentar las operaciones pendientes.',
      })
    },
    [canSave, trimmedDraft, clearUnauthorizedErrors, showToast],
  )

  const handleClear = useCallback(() => {
    if (!canClear) {
      return
    }
    apiClient.clearAccessToken({ persist: true })
    setCurrentToken('')
    setTokenDraft('')
    setRequestError(null)
    clearUnauthorizedErrors()
    showToast({
      type: 'info',
      title: 'Token eliminado',
      description: 'Las siguientes solicitudes se enviarán sin autenticación.',
    })
  }, [canClear, clearUnauthorizedErrors, showToast])

  const handleGenerateToken = useCallback(
    async (event) => {
      event.preventDefault()
      if (!canRequestToken || isRequestingToken) {
        return
      }

      setIsRequestingToken(true)
      setRequestError(null)

      try {
        const response = await apiClient.post(
          '/auth/token',
          { username: trimmedUsername, password },
          { auth: false },
        )
        const generatedToken = extractTokenFromResponse(response?.data)

        if (!generatedToken) {
          throw new Error(
            'El backend no devolvió un token. Verifica la configuración del endpoint /auth/token.',
          )
        }

        const savedToken = apiClient.setAccessToken(generatedToken, { persist: true }) ?? ''
        setCurrentToken(savedToken)
        setTokenDraft(savedToken)
        clearUnauthorizedErrors()
        setPassword('')
        showToast({
          type: 'success',
          title: 'Token generado automáticamente',
          description: 'Se guardó el token. Vuelve a intentar las acciones pendientes.',
        })
      } catch (error) {
        let message = 'No pudimos generar el token. Verifica tus credenciales e inténtalo nuevamente.'

        if (error instanceof ApiError) {
          if (error.status === 401) {
            message = 'Usuario o contraseña incorrectos. Vuelve a intentarlo.'
          } else if (error.status >= 500) {
            message =
              'El backend respondió con un error. Intenta nuevamente en unos minutos o revisa el servidor.'
          } else if (error.message) {
            message = error.message
          }
        } else if (error instanceof Error && error.message) {
          message = error.message
        }

        setRequestError(message)
        showToast({
          type: 'error',
          title: 'No se pudo generar el token',
          description: message,
          dedupeKey: 'toast:token-generation-error',
        })
      } finally {
        setIsRequestingToken(false)
      }
    },
    [canRequestToken, isRequestingToken, trimmedUsername, password, clearUnauthorizedErrors, showToast],
  )

  if (!shouldShowBanner) {
    return null
  }

  const tokenFieldId = 'api-access-token-input'

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/95 p-5 shadow-sm shadow-red-200/40">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 gap-3">
          <div className="mt-0.5 hidden text-red-500 sm:block">
            <ShieldAlert aria-hidden className="h-7 w-7" />
          </div>
          <div className="space-y-3 text-red-900">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert aria-hidden className="h-5 w-5 text-red-500 sm:hidden" />
              <span>No hay un token de acceso válido para la API</span>
            </div>
            <p className="text-sm text-red-800">
              Configura un token JWT emitido por el backend para continuar. Sin un token válido la API rechaza las
              solicitudes con código <strong>401</strong> y las operaciones del listado quedarán bloqueadas.
            </p>
            <div className="space-y-2 text-xs text-red-700">
              <p className="font-semibold text-red-800">Solución recomendada sin usar código:</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Escribe el correo y la contraseña que utilizas para entrar al backend.</li>
                <li>
                  Haz clic en <strong>Generar y guardar token</strong> para que la aplicación lo obtenga automáticamente.
                </li>
                <li>Repite la acción que se había bloqueado.</li>
              </ol>
              <p>
                Tus credenciales solo se envían a tu backend para generar el token. No se almacenan en este navegador ni se
                comparten con terceros.
              </p>
            </div>
            <div className="space-y-2 text-xs text-red-700">
              <p className="font-semibold text-red-800">Acciones bloqueadas mientras falte el token:</p>
              <ul className="list-disc space-y-1 pl-5">
                {actionsToShow.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-2 text-xs text-red-700">
              <p className="font-semibold text-red-800">Otras opciones disponibles:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Pegar manualmente un token existente en el formulario de la derecha.</li>
                <li>
                  Definir la variable <code>VITE_API_ACCESS_TOKEN</code> en tu archivo <code>.env.local</code> para que se
                  aplique automáticamente al iniciar la aplicación.
                </li>
              </ul>
              <details className="rounded-lg border border-red-200/70 bg-white/60 p-3 text-red-800/90">
                <summary className="cursor-pointer text-xs font-semibold text-red-800">
                  ¿Prefieres generarlo desde la terminal?
                </summary>
                <div className="mt-2 space-y-2 text-xs">
                  <ol className="list-decimal space-y-1 pl-5 text-red-700">
                    <li>Abre una terminal donde tengas corriendo el backend de Red-Link.</li>
                    <li>
                      Ejecuta el endpoint <code>POST /auth/token</code> para generar un token temporal (ver ejemplo abajo).
                    </li>
                    <li>Copia el valor de <code>access_token</code> y pégalo en el formulario.</li>
                  </ol>
                  <p>
                    Ejemplo con <code>curl</code>:
                  </p>
                  <pre className="overflow-x-auto rounded-lg bg-white/80 p-3 font-mono text-[11px] leading-5 text-slate-700 shadow-inner">
                    <code>
                      {`curl -X POST http://localhost:8000/auth/token \\n  -H "Content-Type: application/json" \\n  -d '{\"username\":\"admin@example.com\",\"password\":\"TuContraseñaSegura123\"}'`}
                    </code>
                  </pre>
                </div>
              </details>
            </div>
          </div>

        </div>
        <div className="flex w-full max-w-md flex-col gap-4">
          <form
            onSubmit={handleGenerateToken}
            className="flex flex-col gap-3 rounded-xl border border-white/60 bg-white/95 p-4 shadow-inner"
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              <LogIn aria-hidden className="h-4 w-4 text-red-500" />
              Generar token automáticamente
            </div>
            <p className="text-[11px] leading-5 text-slate-500">
              Usa las mismas credenciales que empleas para iniciar sesión en el backend de Red-Link.
            </p>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-600" htmlFor="api-token-username">
              Correo electrónico
            </label>
            <input
              id="api-token-username"
              name="apiAccessUsername"
              type="email"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="tu.usuario@empresa.com"
              className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300/60"
              autoComplete="username"
              spellCheck={false}
              required
            />
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-600" htmlFor="api-token-password">
              Contraseña
            </label>
            <input
              id="api-token-password"
              name="apiAccessPassword"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Ingresa tu contraseña"
              className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300/60"
              autoComplete="current-password"
              required
            />
            <p className="text-[11px] leading-5 text-slate-500">
              Solo se usará una vez para solicitar el token y se descartará al finalizar el proceso.
            </p>
            {requestError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700" role="alert">
                {requestError}
              </p>
            )}
            <Button type="submit" size="sm" disabled={!canRequestToken}>
              {isRequestingToken ? 'Generando…' : 'Generar y guardar token'}
            </Button>
          </form>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 rounded-xl border border-white/60 bg-white/90 p-4 shadow-inner"
          >
            <label
              htmlFor={tokenFieldId}
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700"
            >
              <KeyRound aria-hidden className="h-4 w-4 text-red-500" />
              Token de acceso
            </label>
            <input
              id={tokenFieldId}
              name="apiAccessToken"
              type="text"
              value={tokenDraft}
              onChange={(event) => setTokenDraft(event.target.value)}
              placeholder="Pega aquí tu token JWT"
              className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300/60"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[11px] leading-5 text-slate-500">
              El token se guarda en el navegador y se envía como cabecera <code>Authorization</code> en cada solicitud.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!canSave}>
                Guardar token
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!canClear} onClick={handleClear}>
                Limpiar
              </Button>
            </div>
          </form>
        </div>

      </div>
    </section>
  )
}

export default ApiAccessTokenBanner
