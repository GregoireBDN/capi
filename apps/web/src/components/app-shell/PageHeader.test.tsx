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

/** The authenticated shell's header slots, as `AppHeader` registers them. */
function TopBarSlot() {
  const setSlot = useSetPageActionsSlot()
  const setBackSlot = useSetPageBackSlot()
  return (
    <header aria-label="En-tête">
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

  it('moves the actions to the header as named icon buttons on phones (#386)', async () => {
    emulatePhone()
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const onEdit = vi.fn()
    renderInShell(
      <PageHeader title="Comptes" actions={actions(onAdd, onEdit)} />,
    )

    const add = await within(topBar()).findByRole('button', {
      name: 'Ajouter une opération',
    })
    expect(add).not.toHaveTextContent('Ajouter une opération')
    await user.click(add)
    await user.click(within(topBar()).getByRole('button', { name: 'Modifier' }))
    expect(onAdd).toHaveBeenCalledOnce()
    expect(onEdit).toHaveBeenCalledOnce()
    // Nothing left beside the title, and no menu for two.
    expect(within(page()).queryByRole('button')).not.toBeInTheDocument()
    expect(
      within(topBar()).queryByRole('button', { name: 'Plus d’actions' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the main one and a menu of the others past two actions on phones', async () => {
    emulatePhone()
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const more: PageAction = {
      label: 'Importer un relevé',
      icon: <PlusIcon />,
      onSelect: vi.fn(),
    }
    renderInShell(
      <PageHeader
        title="Comptes"
        actions={[...actions(vi.fn(), onEdit), more]}
      />,
    )

    expect(
      await within(topBar()).findByRole('button', {
        name: 'Ajouter une opération',
      }),
    ).toBeInTheDocument()
    await user.click(
      within(topBar()).getByRole('button', { name: 'Plus d’actions' }),
    )
    expect(
      await screen.findByRole('menuitem', { name: 'Importer un relevé' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: 'Ajouter une opération' }),
    ).not.toBeInTheDocument()
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

  it('puts the way back in the header on every width (#293, #324, #386)', () => {
    const back = { label: 'Épargne', to: '/savings' } as const
    for (const phone of [false, true]) {
      emulatePhone(phone)
      const { unmount } = renderInShell(
        <PageHeader title="Compte courant" back={back} />,
      )
      expect(
        within(topBarBack()).getByRole('link', { name: 'Épargne' }),
      ).toHaveAttribute('href', '/savings')
      expect(within(page()).queryByRole('link')).toBeNull()
      unmount()
    }
  })

  it('keeps the way back in the page outside the shell', () => {
    render(
      <PageHeader
        title="Compte courant"
        back={{ label: 'Épargne', to: '/savings' }}
      />,
    )
    const link = screen.getByRole('link', { name: 'Épargne' })
    expect(link).toHaveAttribute('href', '/savings')
    // Before the title.
    expect(
      link.compareDocumentPosition(
        screen.getByRole('heading', { name: 'Compte courant' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
