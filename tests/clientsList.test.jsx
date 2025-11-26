import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClientsList from '../src/features/clients/ClientsList.jsx'

const sampleClients = [
  { id: '1', name: 'Ana', location: 'Centro', debtMonths: 0, services: [] },
  { id: '2', name: 'Luis', location: 'Norte', debtMonths: 2, services: [] },
]

describe('ClientsList', () => {
  it('muestra filtros y filas de clientes', () => {
    const onSelect = vi.fn()
    const onDelete = vi.fn()

    const { container } = render(
      <ClientsList
        clients={sampleClients}
        status={{}}
        onReload={() => {}}
        onSelectClient={onSelect}
        selectedClientId={null}
        onDeleteClient={onDelete}
      />,
    )

    expect(screen.getByTestId('search-clients')).toBeInTheDocument()
    expect(screen.getByTestId('location-filter')).toBeInTheDocument()
    expect(container.innerHTML).toContain('Ana')
    expect(container.innerHTML).toContain('Luis')
    expect(screen.getByTestId('select-1')).toBeInTheDocument()
    expect(screen.getByTestId('delete-1')).toBeInTheDocument()
  })
})
