import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClientForm from '../src/features/clients/ClientForm.jsx'

describe('ClientForm', () => {
  it('renderiza campos principales sin servicios', () => {
    const onSubmit = vi.fn().mockResolvedValue({})

    const { container } = render(<ClientForm onSubmit={onSubmit} isSubmitting={false} />)

    expect(container.innerHTML).toContain('Agregar cliente')
    expect(screen.getByTestId('client-name')).toBeInTheDocument()
    expect(screen.getByTestId('client-zone')).toBeInTheDocument()
    expect(container.innerHTML).toContain('Captura solo los datos básicos')
  })
})
