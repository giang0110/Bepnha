import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import App from '@/app/App'

test('renders the Phase 0 weekly meal-planning shell without product controls', () => {
  render(<App />)

  expect(screen.getByRole('heading', { level: 1, name: 'Bếp Nhà' })).toBeInTheDocument()
  expect(screen.getByText(/lập kế hoạch bữa ăn hằng tuần/i)).toBeInTheDocument()
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
