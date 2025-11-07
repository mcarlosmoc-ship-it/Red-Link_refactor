import React, { useEffect, useMemo, useState } from 'react'
import { Mail, RefreshCcw, Search } from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import { Card, CardContent } from '../components/ui/Card.jsx'
import { useAccountManagement } from '../hooks/useAccountManagement.js'
import { useToast } from '../hooks/useToast.js'
import { formatDate, today } from '../utils/formatters.js'

const indicatorStyles = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-rose-500',
  neutral: 'bg-slate-400',
}

const paymentStatusLabel = {
  green: 'Al corriente',
  yellow: 'Vence pronto',
  red: 'Vencido / suspendido',
  neutral: 'Sin fecha definida',
}

const normalizeDateOnly = (value) => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getStatusForClient = (client) => {
  const status = (client.status ?? '').toLowerCase()
  if (status === 'suspendido' || status === 'suspendida') {
    return 'red'
  }
  if (status === 'moroso' || status === 'morosa') {
    return 'red'
  }

  const dueDate = client.nextPayment ? new Date(client.nextPayment) : null
  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    return 'neutral'
  }

  const todayDate = new Date()
  todayDate.setHours(0, 0, 0, 0)
  const cleanDue = new Date(dueDate)
  cleanDue.setHours(0, 0, 0, 0)
  const diffDays = Math.round((cleanDue.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return 'red'
  }
  if (diffDays <= 5) {
    return 'yellow'
  }
  return 'green'
}

export default function PrincipalAccountsPage() {
  const {
    principalAccounts,
    clientAccounts,
    status,
    reload,
    createClientAccount,
    registerClientAccountPayment,
    updateClientAccountPassword,
  } = useAccountManagement()
  const { showToast } = useToast()
  const [selectedPrincipalId, setSelectedPrincipalId] = useState(null)
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [paymentDateFilter, setPaymentDateFilter] = useState('')
  const [clientForm, setClientForm] = useState({
    name: '',
    email: '',
    profile: '',
    password: '',
    status: 'activo',
  })
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'Transferencia',
    paymentDate: today(),
    period: '',
    notes: '',
  })
  const [passwordForm, setPasswordForm] = useState({ password: '' })
  const [isCreatingClient, setIsCreatingClient] = useState(false)
  const [isRegisteringPayment, setIsRegisteringPayment] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

  const isLoadingPrincipal = Boolean(status?.principalAccounts?.isLoading)
  const isLoadingClients = Boolean(status?.clientAccounts?.isLoading)
  const hasPrincipalError = Boolean(status?.principalAccounts?.error)
  const hasClientError = Boolean(status?.clientAccounts?.error)

  useEffect(() => {
    if (!principalAccounts.length) {
      setSelectedPrincipalId(null)
      return
    }
    if (!selectedPrincipalId) {
      setSelectedPrincipalId(principalAccounts[0].id)
      return
    }
    const exists = principalAccounts.some((item) => item.id === selectedPrincipalId)
    if (!exists) {
      setSelectedPrincipalId(principalAccounts[0].id)
    }
  }, [principalAccounts, selectedPrincipalId])

  useEffect(() => {
    setSelectedClientId(null)
  }, [selectedPrincipalId])

  const clientsByPrincipal = useMemo(() => {
    return clientAccounts.reduce((acc, client) => {
      const key = client.principalId
      if (!key) {
        return acc
      }
      if (!acc.has(key)) {
        acc.set(key, [])
      }
      acc.get(key).push(client)
      return acc
    }, new Map())
  }, [clientAccounts])

  const clientsForPrincipal = useMemo(() => {
    if (!selectedPrincipalId) {
      return []
    }
    const list = clientsByPrincipal.get(selectedPrincipalId) ?? []
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [clientsByPrincipal, selectedPrincipalId])

  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const paymentFilterDate = paymentDateFilter || ''

    return clientsForPrincipal.filter((client) => {
      const matchesTerm = term
        ? client.name.toLowerCase().includes(term) || client.email.toLowerCase().includes(term)
        : true
      const normalizedNextPayment = normalizeDateOnly(client.nextPayment)
      const matchesPayment = paymentFilterDate ? normalizedNextPayment === paymentFilterDate : true
      return matchesTerm && matchesPayment
    })
  }, [clientsForPrincipal, searchTerm, paymentDateFilter])

  const selectedClient = useMemo(
    () => clientsForPrincipal.find((client) => client.id === selectedClientId) ?? null,
    [clientsForPrincipal, selectedClientId],
  )

  const handleReload = async () => {
    try {
      await reload({ retries: 1 })
      showToast({
        type: 'success',
        title: 'Información sincronizada',
        description: 'Se actualizaron los correos principales y sus clientes.',
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo actualizar',
        description: error?.message ?? 'Intenta nuevamente más tarde.',
      })
    }
  }

  const handleCreateClient = async (event) => {
    event.preventDefault()
    if (!selectedPrincipalId) {
      showToast({
        type: 'warning',
        title: 'Selecciona un correo principal',
        description: 'Elige un correo principal antes de registrar un cliente.',
      })
      return
    }

    const name = clientForm.name.trim()
    const email = clientForm.email.trim()
    const profile = clientForm.profile.trim()
    const password = clientForm.password.trim()
    const statusValue = clientForm.status.trim().toLowerCase()

    if (!name || !email || !profile || !password) {
      showToast({
        type: 'warning',
        title: 'Campos incompletos',
        description: 'Completa nombre, correo, perfil y contraseña para dar de alta al cliente.',
      })
      return
    }

    setIsCreatingClient(true)
    try {
      await createClientAccount({
        principalAccountId: selectedPrincipalId,
        name,
        email,
        profile,
        password,
        status: statusValue,
      })
      showToast({
        type: 'success',
        title: 'Cliente agregado',
        description: 'La cuenta del cliente se registró correctamente.',
      })
      setClientForm({ name: '', email: '', profile: '', password: '', status: 'activo' })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo registrar al cliente',
        description: error?.message ?? 'Intenta nuevamente más tarde.',
      })
    } finally {
      setIsCreatingClient(false)
    }
  }

  const handleRegisterPayment = async (event) => {
    event.preventDefault()
    if (!selectedClient) {
      showToast({
        type: 'warning',
        title: 'Selecciona un cliente',
        description: 'Elige un cliente para registrar el pago correspondiente.',
      })
      return
    }

    const amount = Number(paymentForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast({
        type: 'warning',
        title: 'Monto inválido',
        description: 'Ingresa un monto mayor a cero para registrar el pago.',
      })
      return
    }

    const paymentDate = paymentForm.paymentDate || today()
    const method = paymentForm.method.trim() || 'Transferencia'
    const period = paymentForm.period.trim()
    const notes = paymentForm.notes.trim()

    setIsRegisteringPayment(true)
    try {
      await registerClientAccountPayment({
        clientAccountId: selectedClient.id,
        amount,
        paymentDate,
        method,
        period: period || null,
        notes: notes || null,
      })
      showToast({
        type: 'success',
        title: 'Pago registrado',
        description: 'El pago se guardó y se actualizó la fecha de vencimiento.',
      })
      setPaymentForm((prev) => ({ ...prev, amount: '', period: '', notes: '' }))
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo registrar el pago',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    } finally {
      setIsRegisteringPayment(false)
    }
  }

  const handleUpdatePassword = async (event) => {
    event.preventDefault()
    if (!selectedClient) {
      showToast({
        type: 'warning',
        title: 'Selecciona un cliente',
        description: 'Elige un cliente antes de actualizar su contraseña.',
      })
      return
    }

    const password = passwordForm.password.trim()
    if (!password) {
      showToast({
        type: 'warning',
        title: 'Contraseña requerida',
        description: 'Ingresa la nueva contraseña del cliente.',
      })
      return
    }

    setIsUpdatingPassword(true)
    try {
      await updateClientAccountPassword({ clientAccountId: selectedClient.id, password })
      showToast({
        type: 'success',
        title: 'Contraseña actualizada',
        description: 'La contraseña del cliente se actualizó correctamente.',
      })
      setPasswordForm({ password: '' })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se pudo actualizar la contraseña',
        description: error?.message ?? 'Intenta nuevamente.',
      })
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Correos principales</h2>
          <p className="text-sm text-slate-600">
            Monitorea las cuentas principales y las cinco cuentas de cliente asociadas a cada una.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="inline-flex items-center gap-2"
          onClick={handleReload}
          disabled={isLoadingPrincipal || isLoadingClients}
        >
          <RefreshCcw aria-hidden className="h-4 w-4" /> Actualizar
        </Button>
      </div>

      {(hasPrincipalError || hasClientError) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          No se pudieron cargar todos los datos. Intenta actualizar nuevamente.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <Card className="h-full">
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                <Mail aria-hidden className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">Correos principales</p>
                <p className="text-xs text-slate-500">Selecciona un correo para ver sus clientes.</p>
              </div>
            </div>
            <div className="space-y-2">
              {isLoadingPrincipal && principalAccounts.length === 0 ? (
                <p className="text-sm text-slate-500">Cargando correos…</p>
              ) : principalAccounts.length === 0 ? (
                <p className="text-sm text-slate-500">Aún no hay correos principales registrados.</p>
              ) : (
                principalAccounts.map((account) => {
                  const totalClients = clientsByPrincipal.get(account.id)?.length ?? 0
                  const isActive = account.id === selectedPrincipalId
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setSelectedPrincipalId(account.id)}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 ${
                        isActive
                          ? 'border-slate-900 bg-slate-900 text-white shadow'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-sm font-medium">{account.email}</span>
                      <span
                        className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-full px-2 text-xs font-semibold ${
                          isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {totalClients}/5
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold text-slate-900">
                  {selectedPrincipalId
                    ? principalAccounts.find((item) => item.id === selectedPrincipalId)?.email
                    : 'Selecciona un correo principal'}
                </h3>
                {selectedPrincipalId && (
                  <p className="text-sm text-slate-500">
                    Clientes registrados: {clientsForPrincipal.length} de 5 permitidos.
                  </p>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),180px]">
                <div className="relative">
                  <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    placeholder="Buscar por nombre o correo"
                    className="w-full rounded-lg border border-slate-200 bg-white px-9 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
                <input
                  type="date"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={paymentDateFilter}
                  onChange={(event) => setPaymentDateFilter(event.target.value)}
                  aria-label="Filtrar por fecha de pago"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Perfil</th>
                      <th className="px-3 py-2">Próximo pago</th>
                      <th className="px-3 py-2">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoadingClients && clientsForPrincipal.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                          Cargando clientes…
                        </td>
                      </tr>
                    ) : filteredClients.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                          {clientsForPrincipal.length === 0
                            ? 'No hay clientes registrados para este correo.'
                            : 'No se encontraron clientes con los filtros aplicados.'}
                        </td>
                      </tr>
                    ) : (
                      filteredClients.map((client) => {
                        const indicator = getStatusForClient(client)
                        const isSelected = client.id === selectedClientId
                        return (
                          <tr
                            key={client.id}
                            className={`cursor-pointer transition hover:bg-slate-50 ${
                              isSelected ? 'bg-slate-100/70' : ''
                            }`}
                            onClick={() => setSelectedClientId(client.id)}
                          >
                            <td className="px-3 py-3">
                              <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                                <span
                                  aria-hidden
                                  className={`h-2.5 w-2.5 rounded-full ${indicatorStyles[indicator]}`}
                                />
                                {paymentStatusLabel[indicator]}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <div className="space-y-0.5">
                                <p className="font-medium text-slate-800">{client.name}</p>
                                <p className="text-xs text-slate-500">{client.email}</p>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-slate-600">{client.profile}</td>
                            <td className="px-3 py-3 text-slate-600">
                              {client.nextPayment ? formatDate(client.nextPayment) : 'Sin fecha'}
                            </td>
                            <td className="px-3 py-3 text-slate-600 capitalize">{client.status}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Alta de cliente</h4>
                  <p className="text-xs text-slate-500">Registra nuevas cuentas asociadas al correo principal seleccionado.</p>
                </div>
                <form className="space-y-3" onSubmit={handleCreateClient}>
                  <div>
                    <label className="block text-xs font-medium text-slate-500">Nombre del cliente</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={clientForm.name}
                      onChange={(event) => setClientForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500">Correo del cliente</label>
                    <input
                      type="email"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={clientForm.email}
                      onChange={(event) => setClientForm((prev) => ({ ...prev, email: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500">Perfil asignado</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={clientForm.profile}
                      onChange={(event) => setClientForm((prev) => ({ ...prev, profile: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500">Contraseña inicial</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={clientForm.password}
                      onChange={(event) => setClientForm((prev) => ({ ...prev, password: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500">Estatus inicial</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm capitalize focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={clientForm.status}
                      onChange={(event) => setClientForm((prev) => ({ ...prev, status: event.target.value }))}
                    >
                      <option value="activo">Activo</option>
                      <option value="moroso">Moroso</option>
                      <option value="suspendido">Suspendido</option>
                    </select>
                  </div>
                  <Button type="submit" className="w-full" disabled={isCreatingClient || !selectedPrincipalId}>
                    {isCreatingClient ? 'Guardando…' : 'Registrar cliente'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Registrar pago</h4>
                  <p className="text-xs text-slate-500">
                    Selecciona un cliente de la tabla para aplicar su pago y actualizar la fecha de vencimiento.
                  </p>
                </div>
                <form className="space-y-3" onSubmit={handleRegisterPayment}>
                  <div>
                    <label className="block text-xs font-medium text-slate-500">Monto pagado</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={paymentForm.amount}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500">Fecha de pago</label>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={paymentForm.paymentDate}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, paymentDate: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500">Método de pago</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={paymentForm.method}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, method: event.target.value }))}
                    >
                      <option value="Transferencia">Transferencia</option>
                      <option value="Efectivo">Efectivo</option>
                      <option value="Tarjeta">Tarjeta</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500">Periodo correspondiente</label>
                    <input
                      type="text"
                      placeholder="Opcional"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={paymentForm.period}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, period: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500">Notas</label>
                    <textarea
                      rows={3}
                      placeholder="Opcional"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={paymentForm.notes}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isRegisteringPayment || !selectedClient}>
                    {isRegisteringPayment ? 'Registrando…' : 'Registrar pago'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Cambiar contraseña</h4>
                  <p className="text-xs text-slate-500">
                    Asigna una nueva contraseña segura para el cliente seleccionado.
                  </p>
                </div>
                <form className="space-y-3" onSubmit={handleUpdatePassword}>
                  <div>
                    <label className="block text-xs font-medium text-slate-500">Nueva contraseña</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={passwordForm.password}
                      onChange={(event) => setPasswordForm({ password: event.target.value })}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isUpdatingPassword || !selectedClient}>
                    {isUpdatingPassword ? 'Actualizando…' : 'Guardar contraseña'}
                  </Button>
                  {selectedClient && (
                    <p className="text-xs text-slate-500">
                      Actualizando a: <span className="font-medium text-slate-700">{selectedClient.name}</span>
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
