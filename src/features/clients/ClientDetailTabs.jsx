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

  return (
    <Card data-testid="client-details">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>{client.name}</CardTitle>
            <p className="text-sm text-slate-600">{client.location || 'Sin ubicación'}</p>
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
              <span className="font-medium">Mensualidad:</span> ${client.monthlyFee ?? 'N/D'}
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
