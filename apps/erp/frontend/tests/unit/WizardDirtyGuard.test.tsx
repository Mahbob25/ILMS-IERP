import { describe, test, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import WizardDirtyProvider, {
  useWizardDirtyGuard,
} from '@/components/wizards/WizardDirtyGuard'

// Harness: exposes the guard context so we can drive markDirty / guardNavigation
// and observe whether the navigation callback fires.
const Harness = ({ onNavigate }: { onNavigate: () => void }) => {
  const { isDirty, setDirty, guardNavigation } = useWizardDirtyGuard()
  return (
    <div>
      <span data-testid="dirty">{String(isDirty)}</span>
      <button type="button" onClick={() => setDirty(true)}>
        Make Dirty
      </button>
      <button type="button" onClick={() => guardNavigation(onNavigate)}>
        Navigate
      </button>
    </div>
  )
}

const renderHarness = (spy: () => void) =>
  render(
    <WizardDirtyProvider locale="en">
      <Harness onNavigate={spy} />
    </WizardDirtyProvider>
  )

describe('WizardDirtyGuard navigation guard', () => {
  afterEach(() => cleanup())

  test('navigates immediately when there is no unsaved progress', () => {
    const spy = vi.fn()
    renderHarness(spy)
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Leave this page?')).not.toBeInTheDocument()
  })

  test('blocks navigation and shows a confirm modal when dirty', () => {
    const spy = vi.fn()
    renderHarness(spy)

    fireEvent.click(screen.getByRole('button', { name: 'Make Dirty' }))
    expect(screen.getByTestId('dirty').textContent).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }))
    // Navigation must be deferred while dirty
    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByText('Leave this page?')).toBeInTheDocument()
    expect(screen.getByText(/unsaved progress/)).toBeInTheDocument()
  })

  test('cancel keeps the wizard dirty and does not navigate', () => {
    const spy = vi.fn()
    renderHarness(spy)

    fireEvent.click(screen.getByRole('button', { name: 'Make Dirty' }))
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))

    expect(screen.queryByText('Leave this page?')).not.toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByTestId('dirty').textContent).toBe('true')
  })

  test('confirm navigates and clears the dirty state', () => {
    const spy = vi.fn()
    renderHarness(spy)

    fireEvent.click(screen.getByRole('button', { name: 'Make Dirty' }))
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))

    expect(spy).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('dirty').textContent).toBe('false')
    expect(screen.queryByText('Leave this page?')).not.toBeInTheDocument()
  })

  test('beforeunload is prevented only while dirty', () => {
    const spy = vi.fn()
    renderHarness(spy)

    const cleanEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Make Dirty' }))

    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)
  })
})
