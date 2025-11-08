import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyRound, Loader2, LogIn, ShieldAlert } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useBackofficeStore } from '../../store/useBackofficeStore.js'
import { apiClient, subscribeToAccessToken } from '../../services/apiClient.js'
import { useToast } from '../../hooks/useToast.js'
import { requestAccessToken } from '../../services/authService.js'

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
  const [credentials, setCredentials] = useState({ username: '', password: '', otpCode: '' })
  const [isRequestingToken, setIsRequestingToken] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToAccessToken((token) => {
      const normalized = normalizeDraftValue(token)
      setCurrentToken(normalized)
      setTokenDraft(normalized)
    })
    return unsubscribe
  }, [])

  const hasUnauthorized = unauthorizedResources.length > 0
  const normalizedCurrentToken = normalizeDraftValue(currentToken).trim()
  const trimmedDraft = normalizeDraftValue(tokenDraft).trim()
  const shouldShowBanner = hasUnauthorized || !normalizedCurrentToken
  const trimmedUsername = credentials.username.trim()
  const trimmedPassword = credentials.password
  const trimmedOtpCode = credentials.otpCode.trim()

  const actionsFromErrors = useMemo(() => {
    const labels = unauthorizedResources.map((resource) => RESOURCE_ACTIONS[resource] ?? null)
    return uniqueValues(labels)
  }, [unauthorizedResources])

  const actionsToShow = actionsFromErrors.length > 0 ? actionsFromErrors : DEFAULT_ACTIONS
  const canSave = trimmedDraft.length > 0 && trimmedDraft !== normalizedCurrentToken
  const canClear = Boolean(normalizedCurrentToken)
  const canRequestToken = Boolean(trimmedUsername && trimmedPassword) && !isRequestingToken

  const clearUnauthorizedErrors = useCallback(() => {
    unauthorizedResources.forEach((resource) => {
      clearResourceError(resource)
    })
  }, [unauthorizedResources, clearResourceError])

  const handleCredentialsChange = useCallback((field) => (event) => {
    const { value } = event.target
    setCredentials((previous) => ({
      ...previous,
      [field]: value,
    }))
  }, [])

  const handleRequestToken = useCallback(
    async (event) => {
      event.preventDefault()
      if (!trimmedUsername || !trimmedPassword || isRequestingToken) {
        return
      }

      try {
        setIsRequestingToken(true)
        const { access_token: accessToken } = await requestAccessToken({
          username: trimmedUsername,
          password: trimmedPassword,
          otpCode: trimmedOtpCode || undefined,
        })

        if (!accessToken) {
          throw new Error('La respuesta de la API no incluyó un token de acceso.')
        }

        const savedToken = apiClient.setAccessToken(accessToken, { persist: true }) ?? ''
        setCurrentToken(savedToken)
        setTokenDraft(savedToken)
        setCredentials((previous) => ({ ...previous, password: '', otpCode: '' }))
        clearUnauthorizedErrors()

        showToast({
          type: 'success',
          title: 'Inicio de sesión exitoso',
          description: 'El token se guardó correctamente. Vuelve a sincronizar los datos pendientes.',
        })
      } catch (error) {
        const message = error?.message ?? 'Ocurrió un error inesperado al solicitar el token.'
        showToast({
          type: 'error',
          title: 'No se pudo iniciar sesión',
          description: message,
        })
      } finally {
        setIsRequestingToken(false)
      }
    },
    [
      clearUnauthorizedErrors,
      isRequestingToken,
      trimmedOtpCode,
      trimmedPassword,
      trimmedUsername,
      showToast,
    ],
  )

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault()
      if (!canSave) {
        return
      }
      const savedToken = apiClient.setAccessToken(trimmedDraft, { persist: true }) ?? ''
      setCurrentToken(savedToken)
      setTokenDraft(savedToken)
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
    clearUnauthorizedErrors()
    showToast({
      type: 'info',
      title: 'Token eliminado',
      description: 'Las siguientes solicitudes se enviarán sin autenticación.',
    })
  }, [canClear, clearUnauthorizedErrors, showToast])

  if (!shouldShowBanner) {
    return null
  }

  const tokenFieldId = 'api-access-token-input'
  const usernameFieldId = 'api-access-username'
  const passwordFieldId = 'api-access-password'
  const otpFieldId = 'api-access-otp'

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
              solicitudes con código <strong>401</strong> y no podrás realizar las siguientes acciones:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-red-700">
              {actionsToShow.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
            <div className="space-y-2 text-xs text-red-700">
              <p>
                Obtén un token ejecutando el endpoint <code>POST /auth/token</code> en tu backend. Por ejemplo:
              </p>
              <pre className="overflow-x-auto rounded-lg bg-white/80 p-3 font-mono text-[11px] leading-5 text-slate-700 shadow-inner">
                <code>
                  {`curl -X POST http://localhost:8000/auth/token \\\n  -H "Content-Type: application/json" \\\n  -d '{"username":"admin@example.com","password":"TuContraseñaSegura123"}'`}
                </code>
              </pre>
              <p>
                También puedes definir la variable <code>VITE_API_ACCESS_TOKEN</code> en tu <code>.env.local</code> para que
                el token se aplique automáticamente durante el arranque.
              </p>
              <p>
                Si prefieres no copiar el token manualmente, inicia sesión con tus credenciales de administrador desde este
                panel y lo guardaremos por ti.
              </p>
            </div>
          </div>
        </div>
        <div className="flex w-full max-w-md flex-col gap-4">
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
          <form
            onSubmit={handleRequestToken}
            className="flex flex-col gap-3 rounded-xl border border-white/60 bg-white/90 p-4 shadow-inner"
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              <LogIn aria-hidden className="h-4 w-4 text-red-500" />
              Obtener token con mis credenciales
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor={usernameFieldId} className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Usuario
                </label>
                <input
                  id={usernameFieldId}
                  name="username"
                  type="text"
                  value={credentials.username}
                  onChange={handleCredentialsChange('username')}
                  placeholder="admin@example.com"
                  className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300/60"
                  autoComplete="username"
                  spellCheck={false}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={passwordFieldId} className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Contraseña
                </label>
                <input
                  id={passwordFieldId}
                  name="password"
                  type="password"
                  value={credentials.password}
                  onChange={handleCredentialsChange('password')}
                  placeholder="TuContraseñaSegura123"
                  className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300/60"
                  autoComplete="current-password"
                  spellCheck={false}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={otpFieldId} className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Código OTP (opcional)
                </label>
                <input
                  id={otpFieldId}
                  name="otpCode"
                  type="text"
                  inputMode="numeric"
                  value={credentials.otpCode}
                  onChange={handleCredentialsChange('otpCode')}
                  placeholder="123456"
                  className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300/60"
                  autoComplete="one-time-code"
                  spellCheck={false}
                />
              </div>
            </div>
            <p className="text-[11px] leading-5 text-slate-500">
              Enviaremos una solicitud a <code>/auth/token</code>. Si las credenciales son válidas, el token quedará guardado y se
              usará automáticamente en las próximas peticiones.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!canRequestToken} className="gap-2">
                {isRequestingToken ? (
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn aria-hidden className="h-4 w-4" />
                )}
                {isRequestingToken ? 'Solicitando...' : 'Iniciar sesión'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}

export default ApiAccessTokenBanner
