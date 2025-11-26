import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClientDetailTabs from '../src/features/clients/ClientDetailTabs.jsx'

const client = {
  id: '1',
  name: 'Cliente',
  location: 'Centro',
  zoneId: 'A',
  monthlyFee: 400,
  notes: 'Prueba',
  services: [{ id: 's1', name: 'Internet', status: 'active' }],
  recentPayments: [{ id: 'p1', amount: 300, paidAt: '2024-01-01' }],
}

describe('ClientDetailTabs', () => {
  it('muestra información básica y pestañas específicas', () => {
    const summaryRender = render(<ClientDetailTabs client={client} />)

    expect(summaryRender.container.innerHTML).toContain('Cliente')
    expect(summaryRender.container.innerHTML).toContain('Zona:')

    summaryRender.unmount()
    const paymentsRender = render(<ClientDetailTabs client={client} initialTab="payments" />)
    expect(paymentsRender.container.innerHTML).toContain('Pago de')

    paymentsRender.unmount()
    const servicesRender = render(<ClientDetailTabs client={client} initialTab="services" />)
    expect(screen.getByText('Internet')).toBeInTheDocument()
    servicesRender.unmount()
  })
})
