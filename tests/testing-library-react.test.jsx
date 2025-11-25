import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('testing-library-react mock', () => {
  it('matches test ids containing regex metacharacters literally', () => {
    render(<div data-testid="special.*[id]">Content</div>)

    expect(screen.getByTestId('special.*[id]')).toBeInTheDocument()
  })

  it('does not treat test ids as regex patterns', () => {
    render(<div data-testid="literal-id">Content</div>)

    expect(screen.queryByTestId('literal.*[id]')).toBeNull()
  })
})
