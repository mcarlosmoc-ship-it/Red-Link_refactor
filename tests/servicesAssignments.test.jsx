import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ServicesAssignments from '../src/features/clients/ServicesAssignments.jsx'

const client = {
  id: '1',
  name: 'Cliente',
  services: [{ id: 's1', name: 'Internet', status: 'active' }],
}
const plans = [
  { id: 'plan-1', name: 'Plan Básico', serviceType: 'internet' },
  { id: 'plan-2', name: 'Token', category: 'token' },
  { id: 'plan-3', name: 'Streaming', category: 'streaming', metadata: { requiresCredentials: true } },
]

describe('ServicesAssignments', () => {
  it('lista servicios actuales y planes disponibles', () => {
    const onAssign = vi.fn()
    const onChangeStatus = vi.fn()
    const onDeleteService = vi.fn()

    const { container } = render(
      <ServicesAssignments
        client={client}
        servicePlans={plans}
        onAssign={onAssign}
        onChangeStatus={onChangeStatus}
        onDeleteService={onDeleteService}
        isProcessing={false}
      />,
    )

    expect(container.innerHTML).toContain('Servicios')
    expect(container.innerHTML).toContain('Internet')
    expect(container.innerHTML).toContain('Plan Básico')
    expect(screen.getByTestId('assignment-plan')).toBeInTheDocument()
    expect(screen.getByTestId('delete-service-s1')).toBeInTheDocument()
  })

  it('muestra errores cuando faltan campos obligatorios por plan', () => {
    const onAssign = vi.fn()

    render(
      <ServicesAssignments
        client={client}
        servicePlans={plans}
        onAssign={onAssign}
        isProcessing={false}
      />,
    )

    fireEvent.change(screen.getByTestId('assignment-plan'), { target: { value: 'plan-3' } })
    fireEvent.click(screen.getByTestId('assign-service'))

    expect(screen.getByTestId('assignment-notes-error')).toBeInTheDocument()
    expect(onAssign).not.toHaveBeenCalled()
  })
})
