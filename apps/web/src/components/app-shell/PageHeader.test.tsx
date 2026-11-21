import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PencilIcon, PlusIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DefaultPageBack } from './PageBack'
import { PageHeader } from './PageHeader'
import {
  PageActionsSlotProvider,
  useRegisterPageAction,
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

  it.each([false, true])(
    'puts the actions in the header’s « Actions de la page » menu (phone: %s, #386)',
    async (phone) => {
      emulatePhone(phone)
      const user = userEvent.setup()
      const onAdd = vi.fn()
      const onEdit = vi.fn()
      renderInShell(
        <PageHeader title="Comptes" actions={actions(onAdd, onEdit)} />,
      )

      await user.click(
        await within(topBar()).findByRole('button', {
          name: 'Actions de la page',
        }),
      )
      const items = await screen.findAllByRole('menuitem')
      // The main action first.
      expect(items.map((item) => item.textContent)).toEqual([
        'Ajouter une opération',
        'Modifier',
      ])
      await user.click(screen.getByRole('menuitem', { name: 'Modifier' }))
      expect(onEdit).toHaveBeenCalledOnce()
      // Nothing beside the title.
      expect(within(page()).queryByRole('button')).not.toBeInTheDocument()
    },
  )

  it('shows what waits behind an item on it and on « ⋮ » (#393)', async () => {
    const user = userEvent.setup()
    const view = renderInShell(
      <PageHeader
        title="Dépenses"
        actions={[
          ...actions(),
          {
            label: 'Voir les opérations',
            icon: <PencilIcon />,
            onSelect: vi.fn(),
            count: { value: 7, label: '7 opérations à revoir' },
          },
        ]}
      />,
    )

    const more = await within(topBar()).findByRole('button', {
      name: 'Actions de la page',
    })
    expect(more).toHaveAccessibleDescription('7 opérations à revoir')
    // A dot on « ⋮ », the number on the item only (the owner).
    expect(
      within(topBar())
        .getByTestId('page-actions-count')
        .querySelector('[aria-hidden]'),
    ).toBeEmptyDOMElement()
    await user.click(more)
    expect(
      screen.getByRole('menuitem', {
        name: /^Voir les opérations\s*, 7 opérations à revoir$/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'Modifier' }),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')

    // Nothing waiting: no count anywhere.
    view.rerender(
      <PageActionsSlotProvider>
        <TopBarSlot />
        <main>
          <PageHeader
            title="Dépenses"
            actions={[
              {
                label: 'Voir les opérations',
                icon: <PencilIcon />,
                onSelect: vi.fn(),
                count: { value: 0, label: '0 opération à revoir' },
              },
            ]}
          />
        </main>
      </PageActionsSlotProvider>,
    )
    expect(
      within(topBar()).queryByTestId('page-actions-count'),
    ).not.toBeInTheDocument()
    expect(
      within(topBar()).getByRole('button', { name: 'Actions de la page' }),
    ).not.toHaveAttribute('aria-describedby')
  })

  it('shows no menu on a page without actions', () => {
    renderInShell(<PageHeader title="Tableau de bord" />)

    expect(topBar()).toBeEmptyDOMElement()
  })

  it('keeps the actions beside the title outside the shell', () => {
    emulatePhone()
    render(<PageHeader title="Opérations" actions={actions()} />)

    expect(
      screen.getByRole('button', { name: 'Ajouter une opération' }),
    ).toBeInTheDocument()
  })

  it('puts the way back in the header as a breadcrumb (#386, #404)', () => {
    const back = { label: 'Épargne', to: '/savings' } as const
    for (const phone of [false, true]) {
      emulatePhone(phone)
      const { unmount } = renderInShell(
        <PageHeader title="Compte courant" back={back} />,
      )
      // One trail, the parent a link, the page as text: from `md` up
      // « Épargne › Compte courant », « ‹ Épargne » on phones (CSS only).
      const trail = within(topBarBack()).getByRole('navigation', {
        name: 'Fil d’Ariane',
      })
      expect(
        within(trail).getByRole('link', { name: 'Épargne' }),
      ).toHaveAttribute('href', '/savings')
      expect(within(trail).getByText('Compte courant')).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(within(trail).getAllByRole('listitem')).toHaveLength(2)
      // The title stays the page's own.
      expect(
        within(page()).getByRole('heading', { name: 'Compte courant' }),
      ).toBeInTheDocument()
      expect(within(page()).queryByRole('link')).toBeNull()
      unmount()
    }
  })

  it('takes the way back of its layout when it has none (#404)', () => {
    renderInShell(
      <DefaultPageBack back={{ label: 'Réglages', to: '/settings' }}>
        <PageHeader title="Sécurité" />
      </DefaultPageBack>,
    )
    const trail = within(topBarBack()).getByRole('navigation', {
      name: 'Fil d’Ariane',
    })
    expect(
      within(trail).getByRole('link', { name: 'Réglages' }),
    ).toHaveAttribute('href', '/settings')
    expect(within(trail).getByText('Sécurité')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('names an account by its type in the breadcrumb (#404)', () => {
    const name = 'Assurance vie Linxea Spirit 2 — contrat principal'
    renderInShell(
      <PageHeader
        title={name}
        crumb="Assurance vie"
        compactTitle
        back={{ label: 'Comptes', to: '/accounts' }}
      />,
    )
    const trail = within(topBarBack()).getByRole('navigation', {
      name: 'Fil d’Ariane',
    })
    expect(within(trail).getByText('Assurance vie')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(trail).queryByText(name)).toBeNull()
    // The name stays the page's title, smaller, two lines at most.
    const title = within(page()).getByRole('heading', { name })
    expect(title).toHaveClass('line-clamp-2')
    expect(title).not.toHaveClass('md:text-2xl')
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

  it('adds the « add » of the page’s sections to its menu (#386)', async () => {
    const user = userEvent.setup()
    const onAddGoal = vi.fn()
    function Goals({ show }: { show: boolean }) {
      const inMenu = useRegisterPageAction(
        show
          ? {
              label: 'Ajouter un objectif',
              icon: <PlusIcon />,
              onSelect: onAddGoal,
            }
          : null,
      )
      return inMenu ? null : <button type="button">Ajouter un objectif</button>
    }
    const view = renderInShell(
      <>
        <PageHeader title="Épargne" actions={actions().slice(1)} />
        <Goals show />
      </>,
    )

    await user.click(
      await within(topBar()).findByRole('button', {
        name: 'Actions de la page',
      }),
    )
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Modifier',
      'Ajouter un objectif',
    ])
    await user.click(
      screen.getByRole('menuitem', { name: 'Ajouter un objectif' }),
    )
    expect(onAddGoal).toHaveBeenCalledOnce()
    // No button of its own in the section.
    expect(
      within(page()).queryByRole('button', { name: 'Ajouter un objectif' }),
    ).not.toBeInTheDocument()

    // Hidden section: out of the menu.
    view.rerender(
      <PageActionsSlotProvider>
        <TopBarSlot />
        <main>
          <PageHeader title="Épargne" />
          <Goals show={false} />
        </main>
      </PageActionsSlotProvider>,
    )
    await vi.waitFor(() => expect(topBar()).toBeEmptyDOMElement())
  })

  it('keeps a section’s own button outside the shell', () => {
    function Goals() {
      const inMenu = useRegisterPageAction({
        label: 'Ajouter un objectif',
        icon: <PlusIcon />,
        onSelect: vi.fn(),
      })
      return inMenu ? null : <button type="button">Ajouter un objectif</button>
    }
    render(<Goals />)

    expect(
      screen.getByRole('button', { name: 'Ajouter un objectif' }),
    ).toBeInTheDocument()
  })
})
