import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PencilIcon, PlusIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageHeader } from './PageHeader'
import {
  PageActionsSlotProvider,
  useSetPageActionsSlot,
  useSetPageBackSlot,
} from './page-actions'
import type { PageAction } from './page-actions'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string
    children: ReactNode
    params?: unknown
    search?: unknown
  }) => {
    const { params: _params, search: _search, ...rest } = props
    return (
      <a href={to} {...rest}>
        {children}
      </a>
    )
  },
}))

/** Emulates a phone (below md) for `useIsMobile`, or a wide screen. */
function emulatePhone(phone = true) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: phone && query.includes('max-width'),
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
  const setBackSlot = useSetPageBackSlot()
  return (
    <header aria-label="Barre du haut">
      <nav aria-label="Retour" ref={setBackSlot} />
      <div data-testid="top-bar-actions" ref={setSlot} />
    </header>
  )
}

function renderInShell(children: ReactNode) {
  return render(
    <PageActionsSlotProvider>
      <TopBarSlot />
      <main>{children}</main>
    </PageActionsSlotProvider>,
  )
}

const topBar = () => screen.getByTestId('top-bar-actions')
const topBarBack = () => screen.getByRole('navigation', { name: 'Retour' })
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

  it('puts the way back above the title from md up, in the top bar on phones (#293, #324)', () => {
    const back = { label: 'Épargne', to: '/savings' } as const
    emulatePhone(false)
    const { unmount } = renderInShell(
      <PageHeader title="Compte courant" back={back} />,
    )
    const chip = within(page()).getByRole('link', { name: 'Épargne' })
    expect(chip).toHaveAttribute('href', '/savings')
    // Before the title.
    expect(
      chip.compareDocumentPosition(
        screen.getByRole('heading', { name: 'Compte courant' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(topBarBack()).toBeEmptyDOMElement()
    unmount()

    emulatePhone()
    renderInShell(<PageHeader title="Compte courant" back={back} />)
    expect(
      within(topBarBack()).getByRole('link', { name: 'Épargne' }),
    ).toHaveAttribute('href', '/savings')
    expect(within(page()).queryByRole('link')).toBeNull()
  })
})
