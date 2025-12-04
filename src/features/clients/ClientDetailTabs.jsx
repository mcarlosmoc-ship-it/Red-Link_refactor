import React, { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import { formatDate } from '../../utils/formatters.js'
import { getPrimaryService } from './utils.js'

const TABS = [
  { id: 'summary', label: 'Resumen' },
  { id: 'services', label: 'Servicios' },
  { id: 'payments', label: 'Pagos' },
]

export default function ClientDetailTabs({ client, initialTab = 'summary' }) {
  const [activeTab, setActiveTab] = useState(initialTab)
  const primaryService = useMemo(() => getPrimaryService(client), [client])

  React.useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  if (!client) return null

  const monthlyFee =
    primaryService?.effectivePrice ?? primaryService?.price ?? primaryService?.customPrice ?? null
  const monthlyLabel =
    primaryService && Number.isFinite(Number(monthlyFee))
      ? `$${Number(monthlyFee)}`
      : 'Sin servicio asignado'

  return (
    <Card data-testid="client-details">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>{client.name}</CardTitle>
            <p className="text-sm text-slate-600">{client.location || 'Sin ubicación'}</p>
            {Number(client.debtMonths ?? 0) > 0 && (
              <span className="mt-1 inline-flex items-center gap-2 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                Adeudo activo ({client.debtMonths} mes{Number(client.debtMonths) === 1 ? '' : 'es'})
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`rounded px-3 py-1 text-sm ${
                  activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activeTab === 'summary' && (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Zona:</span> {client.zoneId || 'Sin zona'}
            </p>
            <p>
              <span className="font-medium">Mensualidad:</span> {monthlyLabel}
            </p>
            <p>
              <span className="font-medium">Notas:</span> {client.notes || 'Sin notas'}
            </p>
          </div>
        )}
        {activeTab === 'services' && (
          <div className="space-y-2 text-sm">
            {Array.isArray(client.services) && client.services.length > 0 ? (
              client.services.map((service) => (
                <div key={service.id} className="rounded border border-slate-200 p-2">
                  <p className="font-medium">{service.name || 'Servicio'}</p>
                  <p className="text-slate-600">Estado: {service.status || 'N/D'}</p>
                  <p className="text-slate-600">
                    Tarifa: {service.customPrice ?? service.price ?? 'N/D'}
                  </p>
                  {(Number(service.debtMonths ?? 0) > 0 || Number(service.debtAmount ?? 0) > 0) && (
                    <p className="mt-1 inline-flex items-center gap-2 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                      Adeudo: {service.debtMonths ?? 0} mes(es)
                      {Number(service.debtAmount ?? 0) > 0 && ` • $${service.debtAmount}`}
                    </p>
                  )}
                  <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-slate-600 md:grid-cols-2">
                    {service.ipAddress && <span>IP: {service.ipAddress}</span>}
                    {service.antennaIp && <span>IP antena: {service.antennaIp}</span>}
                    {service.modemIp && <span>IP módem: {service.modemIp}</span>}
                    {service.antennaModel && <span>Antena: {service.antennaModel}</span>}
                    {service.modemModel && <span>Módem: {service.modemModel}</span>}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-600">Sin servicios registrados.</p>
            )}
          </div>
        )}
        {activeTab === 'payments' && (
          <div className="space-y-2 text-sm">
            {Array.isArray(client.recentPayments) && client.recentPayments.length > 0 ? (
              client.recentPayments.map((payment) => (
                <div key={payment.id} className="rounded border border-slate-200 p-2">
                  <p className="font-medium">Pago de ${payment.amount}</p>
                  <p className="text-slate-600">{formatDate(payment.paidAt ?? payment.date)}</p>
                </div>
              ))
            ) : (
              <p className="text-slate-600">Sin pagos registrados.</p>
            )}
          </div>
        )}
      </CardContent>
      {primaryService && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-sm">
          Servicio principal: {primaryService.name || 'Servicio'}
        </div>
      )}
    </Card>
  )
}
