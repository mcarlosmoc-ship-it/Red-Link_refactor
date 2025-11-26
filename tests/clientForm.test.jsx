import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClientForm from '../src/features/clients/ClientForm.jsx'

const plans = [{ id: 'plan-1', name: 'Plan Básico', serviceType: 'internet' }]

describe('ClientForm', () => {
  it('renderiza campos principales y selección de plan', () => {
    const onSubmit = vi.fn().mockResolvedValue({})

    const { container } = render(
      <ClientForm servicePlans={plans} onSubmit={onSubmit} isSubmitting={false} />,
    )

    expect(container.innerHTML).toContain('Agregar cliente')
    expect(screen.getByTestId('client-name')).toBeInTheDocument()
    expect(screen.getByTestId('service-plan')).toBeInTheDocument()
    expect(container.innerHTML).toContain('Plan Básico')
  })
})
