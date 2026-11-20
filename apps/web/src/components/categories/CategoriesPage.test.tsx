import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { categoryField, pickCategory } from '#/test/category-picker'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryDto } from '#/api/types.gen'
import { CategoriesPage } from './CategoriesPage'
import { describeUsage } from './DeleteCategoryDialog'

const api = vi.hoisted(() => ({
  categoriesControllerList: vi.fn(),
  categoriesControllerCreate: vi.fn(),
  categoriesControllerUpdate: vi.fn(),
  categoriesControllerUsage: vi.fn(),
  categoriesControllerRemove: vi.fn(),
  accountsControllerList: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

/** Synthetic categories only. */
function category(
  id: string,
  name: string,
  kind: CategoryDto['kind'],
  overrides: Partial<CategoryDto> = {},
): CategoryDto {
  return {
    id,
    slug: name.toLowerCase(),
    name,
    kind,
    color: '#2a78d6',
    icon: 'shopping-cart',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const GROCERIES = category('c1', 'Courses', 'expense')
const RESTAURANTS = category('c2', 'Restaurants', 'expense')
const SALARY = category('c3', 'Salaire', 'income')
const OLD = category('c4', 'Ancienne', 'expense', {
  archivedAt: '2026-10-01T00:00:00.000Z',
})

const ok = <T,>(data: T, status = 200) =>
  Promise.resolve({ data, response: new Response(null, { status }) })

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <CategoriesPage />
    </QueryClientProvider>,
  )
  return { invalidate }
}

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  api.categoriesControllerList.mockImplementation(() =>
    ok([GROCERIES, RESTAURANTS, OLD, SALARY]),
  )
  api.categoriesControllerUpdate.mockImplementation(
    ({ body }: { body: Partial<CategoryDto> }) => ok({ ...GROCERIES, ...body }),
  )
})

describe('CategoriesPage', () => {
  it('groups active categories by kind and lists archived ones apart', async () => {
    renderPage()

    const expenses = await screen.findByRole('list', { name: 'Dépenses' })
    expect(within(expenses).getByText('Courses')).toBeTruthy()
    expect(within(expenses).queryByText('Ancienne')).toBeNull()
    const income = screen.getByRole('list', { name: 'Revenus' })
    expect(within(income).getByText('Salaire')).toBeTruthy()
    const archived = screen.getByRole('list', { name: 'Catégories archivées' })
    expect(within(archived).getByText('Ancienne')).toBeTruthy()
  })

  it('renames inline and refreshes every page', async () => {
    const user = userEvent.setup()
    const { invalidate } = renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Renommer Courses' }),
    )
    const input = screen.getByRole('textbox', {
      name: 'Nouveau nom de Courses',
    })
    await user.clear(input)
    await user.type(input, 'Supermarché{Enter}')

    await waitFor(() =>
      expect(api.categoriesControllerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 'c1' },
          body: { name: 'Supermarché' },
        }),
      ),
    )
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith())
  })

  it('recolours from the chart palette', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Couleur et icône de Courses',
      }),
    )
    await user.click(await screen.findByRole('radio', { name: 'Violet' }))

    await waitFor(() =>
      expect(api.categoriesControllerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 'c1' },
          body: { color: '#6250d6' },
        }),
      ),
    )
  })

  it('changes the icon (#266)', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Couleur et icône de Courses',
      }),
    )
    const icons = await screen.findByRole('radiogroup', {
      name: 'Icône de Courses',
    })
    expect(within(icons).getByRole('radio', { name: 'Caddie' })).toBeChecked()
    await user.click(within(icons).getByRole('radio', { name: 'Café' }))

    await waitFor(() =>
      expect(api.categoriesControllerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 'c1' },
          body: { icon: 'coffee' },
        }),
      ),
    )
  })

  it('archives from the menu', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Actions pour Courses' }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Archiver' }))

    await waitFor(() =>
      expect(api.categoriesControllerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 'c1' },
          body: { archived: true },
        }),
      ),
    )
  })

  it('adds a category with a kind, a colour and an icon', async () => {
    const user = userEvent.setup()
    api.categoriesControllerCreate.mockImplementation(() =>
      ok(category('c9', 'Vélo', 'income'), 201),
    )
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: /Ajouter une catégorie/ }),
    )
    await user.type(screen.getByRole('textbox', { name: 'Nom' }), ' Vélo ')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), [
      'income',
    ])
    await user.click(screen.getByRole('radio', { name: 'Vert' }))
    await user.click(screen.getByRole('radio', { name: 'Vélo' }))
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() =>
      expect(api.categoriesControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            name: 'Vélo',
            kind: 'income',
            color: '#008300',
            icon: 'bike',
          },
        }),
      ),
    )
    expect(toast.success).toHaveBeenCalledWith('Catégorie Vélo ajoutée')
  })

  it('requires a target of the same kind to delete a category in use', async () => {
    const user = userEvent.setup()
    api.categoriesControllerUsage.mockImplementation(() =>
      ok({ transactions: 12, rules: 1, budgets: 0, recurringItems: 0 }),
    )
    api.categoriesControllerRemove.mockImplementation(() =>
      Promise.resolve({
        data: undefined,
        response: new Response(null, { status: 204 }),
      }),
    )
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Actions pour Courses' }),
    )
    await user.click(
      await screen.findByRole('menuitem', { name: 'Supprimer…' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(
      await within(dialog).findByText(/12 opérations et 1 règle seront/),
    ).toBeTruthy()
    const confirm = within(dialog).getByRole('button', {
      name: 'Déplacer et supprimer',
    })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    // Same kind, not itself, not archived.
    await user.click(categoryField('Déplacer vers', dialog))
    const list = await screen.findByRole('radiogroup', { name: 'Catégorie' })
    expect(
      within(list)
        .getAllByRole('radio')
        .map((option) => option.textContent),
    ).toEqual(['Restaurants'])
    // No tiles: one kind.
    expect(
      screen.queryByRole('radiogroup', { name: 'Type' }),
    ).not.toBeInTheDocument()
    await pickCategory(user, 'Restaurants')
    await user.click(confirm)

    await waitFor(() =>
      expect(api.categoriesControllerRemove).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 'c1' },
          query: { reassignTo: 'c2' },
        }),
      ),
    )
  })

  it('deletes an unused category without asking for a target', async () => {
    const user = userEvent.setup()
    api.categoriesControllerUsage.mockImplementation(() =>
      ok({ transactions: 0, rules: 0, budgets: 0, recurringItems: 0 }),
    )
    api.categoriesControllerRemove.mockImplementation(() =>
      Promise.resolve({
        data: undefined,
        response: new Response(null, { status: 204 }),
      }),
    )
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Actions pour Salaire' }),
    )
    await user.click(
      await screen.findByRole('menuitem', { name: 'Supprimer…' }),
    )
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText(/Aucune opération/)
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }))

    await waitFor(() =>
      expect(api.categoriesControllerRemove).toHaveBeenCalledWith({
        path: { id: 'c3' },
        throwOnError: false,
      }),
    )
  })
})

describe('describeUsage', () => {
  it('joins the counts in French', () => {
    expect(
      describeUsage({
        transactions: 1,
        rules: 2,
        budgets: 1,
        recurringItems: 3,
      }),
    ).toBe('1 opération, 2 règles, 1 objectif de budget et 3 abonnements')
    expect(
      describeUsage({
        transactions: 0,
        rules: 0,
        budgets: 2,
        recurringItems: 0,
      }),
    ).toBe('2 objectifs de budget')
  })
})
