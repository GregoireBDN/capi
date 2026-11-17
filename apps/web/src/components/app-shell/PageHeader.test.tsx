import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PencilIcon, PlusIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageHeader } from './PageHeader'
import { PageActionsSlotProvider, useSetPageActionsSlot } from './page-actions'
import type { PageAction } from './page-actions'

/** Emulates a phone (below md) for `useIsMobile`. */
function emulatePhone() {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

/** The authenticated shell's top bar slot, as `AppTopBar` registers it. */
function TopBarSlot() {
  const setSlot = useSetPageActionsSlot()
  return <header aria-label="Barre du haut" ref={setSlot} />
}

function renderInShell(children: ReactNode) {
  return render(
    <PageActionsSlotProvider>
      <TopBarSlot />
      <main>{children}</main>
    </PageActionsSlotProvider>,
  )
}

const topBar = () => screen.getByRole('banner', { name: 'Barre du haut' })
const page = () => screen.getByRole('main')

function actions(onAdd = vi.fn(), onEdit = vi.fn()): PageAction[] {
  return [
    {
      label: 'Ajouter une opération',
      icon: <PlusIcon />,
      primary: true,
      onSelect: onAdd,
    },
    { label: 'Modifier', icon: <PencilIcon />, onSelect: onEdit },
  ]
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PageHeader', () => {
  it('shows the title as the page heading and the description below', () => {
    render(<PageHeader title="Dépenses" description="Où part votre argent." />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Dépenses' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Où part votre argent.')).toBeInTheDocument()
  })

  it('keeps the actions beside the title from md up', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    renderInShell(<PageHeader title="Opérations" actions={actions(onAdd)} />)

    await user.click(
      within(page()).getByRole('button', { name: 'Ajouter une opération' }),
    )
    expect(onAdd).toHaveBeenCalledOnce()
    expect(
      within(page()).getByRole('button', { name: 'Modifier' }),
    ).toBeInTheDocument()
    expect(topBar()).toBeEmptyDOMElement()
  })

  it('moves a single action to the top bar as a named icon button on phones', async () => {
    emulatePhone()
    const user = userEvent.setup()
    const onAdd = vi.fn()
    renderInShell(
      <PageHeader title="Opérations" actions={actions(onAdd).slice(0, 1)} />,
    )

    const button = await within(topBar()).findByRole('button', {
      name: 'Ajouter une opération',
    })
    expect(button).not.toHaveTextContent('Ajouter une opération')
    expect(within(page()).queryByRole('button')).not.toBeInTheDocument()
    await user.click(button)
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it('groups several actions in a menu of the top bar on phones', async () => {
    emulatePhone()
    const user = userEvent.setup()
    const onEdit = vi.fn()
    renderInShell(
      <PageHeader title="Comptes" actions={actions(vi.fn(), onEdit)} />,
    )

    await user.click(
      await within(topBar()).findByRole('button', { name: 'Plus d’actions' }),
    )
    expect(
      await screen.findByRole('menuitem', { name: 'Ajouter une opération' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Modifier' }))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(within(page()).queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps the actions beside the title outside the shell', () => {
    emulatePhone()
    render(<PageHeader title="Opérations" actions={actions()} />)

    expect(
      screen.getByRole('button', { name: 'Ajouter une opération' }),
    ).toBeInTheDocument()
  })
})
