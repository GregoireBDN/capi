import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountDto,
  CategorizationRuleDto,
  CategorizationRulePreviewDto,
  CategoryDto,
} from '#/api/types.gen'
import { bodyFromForm, formFromRule } from './RuleEditorSheet'
import { RulesPage } from './RulesPage'

const api = vi.hoisted(() => ({
  categorizationRulesControllerList: vi.fn(),
  categorizationRulesControllerCreate: vi.fn(),
  categorizationRulesControllerUpdate: vi.fn(),
  categorizationRulesControllerRemove: vi.fn(),
  categorizationRulesControllerReorder: vi.fn(),
  categorizationRulesControllerPreview: vi.fn(),
  categorizationRulesControllerApply: vi.fn(),
  categoriesControllerList: vi.fn(),
  accountsControllerList: vi.fn(),
  transactionsControllerReviewCount: vi.fn(),
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

/** Synthetic categories, accounts and rules only. */
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
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const GROCERIES = category('c1', 'Courses', 'expense')
const CAFES = category('c2', 'Cafés', 'expense')
const OLD = category('c3', 'Ancienne', 'expense', {
  archivedAt: '2026-10-01T00:00:00.000Z',
})

const ACCOUNT: AccountDto = {
  id: 'a1',
  name: 'Compte test',
  type: 'checking',
  institution: null,
  position: 0,
  archivedAt: null,
  balanceCents: null,
  balanceDate: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function rule(
  id: string,
  position: number,
  labelPattern: string,
  overrides: Partial<CategorizationRuleDto> = {},
): CategorizationRuleDto {
  return {
    id,
    position,
    enabled: true,
    matchType: 'contains',
    labelPattern,
    accountId: null,
    minAmountCents: null,
    maxAmountCents: null,
    categoryId: GROCERIES.id,
    kind: null,
    merchant: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const FAKEMART = rule('r1', 0, 'FAKEMART', {
  accountId: ACCOUNT.id,
  minAmountCents: -5_000,
  maxAmountCents: -100,
})
const CAFE = rule('r2', 1, 'CAFE TEST', { categoryId: CAFES.id })
const ARCHIVED = rule('r3', 2, 'FLEUR TEST', {
  categoryId: OLD.id,
  enabled: false,
})
const ORPHAN = rule('r4', 3, 'GONE TEST', { categoryId: 'c-missing' })

const ok = <T,>(data: T, status = 200) =>
  Promise.resolve({ data, response: new Response(null, { status }) })
const fail = (status: number, message: string) =>
  Promise.resolve({
    error: { message },
    response: new Response(null, { status }),
  })

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RulesPage />
    </QueryClientProvider>,
  )
}

/** Patterns of the listed rules, in display order. */
async function listedPatterns() {
  const list = await screen.findByRole('list', {
    name: 'Règles, dans l’ordre d’application',
  })
  return within(list)
    .getAllByRole('listitem')
    .filter((item) => item.parentElement === list)
    .map((item) => item.getAttribute('aria-label'))
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

/** Rules as the mocked API stores them. */
let server: CategorizationRuleDto[] = []

beforeEach(() => {
  vi.clearAllMocks()
  server = [FAKEMART, CAFE, ARCHIVED, ORPHAN]
  api.categorizationRulesControllerList.mockImplementation(() => ok(server))
  api.categoriesControllerList.mockImplementation(() =>
    ok([GROCERIES, CAFES, OLD]),
  )
  api.accountsControllerList.mockImplementation(() => ok([ACCOUNT]))
  api.transactionsControllerReviewCount.mockImplementation(() =>
    ok({ count: 0 }),
  )
  api.categorizationRulesControllerReorder.mockImplementation(
    ({ body }: { body: { ids: string[] } }) => {
      server = body.ids.map((id, position) => ({
        ...server.find((r) => r.id === id)!,
        position,
      }))
      return ok(server)
    },
  )
  api.categorizationRulesControllerUpdate.mockImplementation(
    ({ path, body }: { path: { id: string }; body: object }) =>
      ok({ ...FAKEMART, id: path.id, ...body }),
  )
})

describe('RulesPage', () => {
  it('lists the rules in order with their conditions and target', async () => {
    renderPage()

    expect(await listedPatterns()).toEqual([
      'Règle 1 : FAKEMART',
      'Règle 2 : CAFE TEST',
      'Règle 3 : FLEUR TEST',
      'Règle 4 : GONE TEST',
    ])
    const first = screen.getByRole('listitem', { name: 'Règle 1 : FAKEMART' })
    expect(within(first).getByText(/compte Compte test/).textContent).toMatch(
      /entre -50,00\s€ et -1,00\s€/,
    )
    expect(within(first).getByText('Courses')).toBeTruthy()
    expect(
      within(first).getByRole('switch', {
        name: 'Activer la règle « FAKEMART »',
      }),
    ).toHaveProperty('ariaChecked', 'true')
  })

  it('flags rules of an archived or deleted category, and disabled ones', async () => {
    renderPage()

    const archived = await screen.findByRole('listitem', {
      name: 'Règle 3 : FLEUR TEST',
    })
    expect(within(archived).getByText('Catégorie archivée')).toBeTruthy()
    expect(within(archived).getByText('Désactivée')).toBeTruthy()
    const orphan = screen.getByRole('listitem', { name: 'Règle 4 : GONE TEST' })
    expect(within(orphan).getByText('Catégorie supprimée')).toBeTruthy()
    expect(
      within(
        screen.getByRole('listitem', { name: 'Règle 2 : CAFE TEST' }),
      ).queryByText(/Catégorie (archivée|supprimée)/),
    ).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(
      /2 règles visent une catégorie archivée ou supprimée/,
    )
  })

  it('moves a rule with the arrows and sends the whole new order', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Descendre la règle « FAKEMART »',
      }),
    )

    await waitFor(() =>
      expect(api.categorizationRulesControllerReorder).toHaveBeenCalledWith(
        expect.objectContaining({ body: { ids: ['r2', 'r1', 'r3', 'r4'] } }),
      ),
    )
    expect((await listedPatterns())[0]).toBe('Règle 1 : CAFE TEST')
    // The ends cannot move further.
    expect(
      screen.getByRole('button', { name: 'Monter la règle « CAFE TEST »' }),
    ).toHaveProperty('disabled', true)
    expect(
      screen.getByRole('button', { name: 'Descendre la règle « GONE TEST »' }),
    ).toHaveProperty('disabled', true)
  })

  it('reorders by dragging a rule onto another', async () => {
    renderPage()

    const dragged = await screen.findByRole('listitem', {
      name: 'Règle 4 : GONE TEST',
    })
    const target = screen.getByRole('listitem', { name: 'Règle 2 : CAFE TEST' })
    fireEvent.mouseDown(within(dragged).getByTitle('Glisser pour déplacer'))
    expect(dragged.getAttribute('draggable')).toBe('true')
    fireEvent.dragStart(dragged)
    fireEvent.dragOver(target)
    fireEvent.drop(target)
    fireEvent.dragEnd(dragged)

    await waitFor(() =>
      expect(api.categorizationRulesControllerReorder).toHaveBeenCalledWith(
        expect.objectContaining({ body: { ids: ['r1', 'r4', 'r2', 'r3'] } }),
      ),
    )
  })

  it('restores the order when the reorder fails', async () => {
    api.categorizationRulesControllerReorder.mockImplementation(() =>
      fail(400, 'ids must list every categorization rule exactly once'),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Monter la règle « CAFE TEST »',
      }),
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'La liste des règles a changé. Rechargez la page.',
      ),
    )
    expect((await listedPatterns())[0]).toBe('Règle 1 : FAKEMART')
  })

  it('disables a rule with its switch', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('switch', {
        name: 'Activer la règle « CAFE TEST »',
      }),
    )

    expect(api.categorizationRulesControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: 'r2' }, body: { enabled: false } }),
    )
  })

  it('tests an edited rule at its position before saving it', async () => {
    const preview: CategorizationRulePreviewDto = {
      matched: 2,
      leavingReview: 1,
      released: 1,
      changed: 3,
      transactions: [
        {
          id: 't1',
          bookingDate: '2026-11-03',
          accountId: ACCOUNT.id,
          rawLabel: 'CB FAKEMART DRIVE 0311',
          merchant: null,
          amountCents: -1_234,
          categoryId: null,
          kind: 'expense',
          nextCategoryId: CAFES.id,
          nextKind: 'expense',
        },
        {
          id: 't2',
          bookingDate: '2026-11-01',
          accountId: ACCOUNT.id,
          rawLabel: 'CB FAKEMART CITY 0111',
          merchant: null,
          amountCents: -560,
          categoryId: GROCERIES.id,
          kind: 'expense',
          nextCategoryId: null,
          nextKind: 'expense',
        },
      ],
    }
    api.categorizationRulesControllerPreview.mockImplementation(() =>
      ok(preview),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Modifier la règle « FAKEMART »',
      }),
    )
    const sheet = await screen.findByRole('dialog')
    const pattern = within(sheet).getByLabelText('Le libellé ou le marchand')
    expect(pattern).toHaveProperty('value', 'FAKEMART')
    expect(within(sheet).getByLabelText('Montant minimum')).toHaveProperty(
      'value',
      '-50',
    )
    await user.clear(pattern)
    await user.type(pattern, 'FAKEMART DRIVE')
    await user.selectOptions(
      within(sheet).getByRole('combobox', { name: 'Catégorie' }),
      CAFES.id,
    )
    await user.click(within(sheet).getByRole('button', { name: 'Tester' }))

    const result = await within(sheet).findByRole('region', {
      name: 'Résultat du test',
    })
    expect(api.categorizationRulesControllerPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          ruleId: 'r1',
          labelPattern: 'FAKEMART DRIVE',
          categoryId: CAFES.id,
          accountId: ACCOUNT.id,
          minAmountCents: -5_000,
          maxAmountCents: -100,
        }),
      }),
    )
    expect(result.textContent).toContain(
      '2 opérations classées par cette règle, dont 1 à revoir.',
    )
    expect(result.textContent).toContain('1 opération quitterait cette règle')
    const changed = within(result).getAllByRole('listitem')
    expect(changed).toHaveLength(2)
    expect(changed[0].textContent).toContain('CB FAKEMART DRIVE 0311')
    expect(changed[0].textContent).toContain('Non classée')
    expect(changed[0].textContent).toContain('Cafés')
    expect(changed[1].textContent).toContain('À revoir')
    expect(result.textContent).toContain('… et 1 autre.')
    expect(api.categorizationRulesControllerUpdate).not.toHaveBeenCalled()

    // Editing again makes the test stale.
    await user.type(pattern, ' X')
    expect(
      within(sheet).queryByRole('region', { name: 'Résultat du test' }),
    ).toBeNull()

    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.categorizationRulesControllerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 'r1' },
          body: expect.objectContaining({
            labelPattern: 'FAKEMART DRIVE X',
            categoryId: CAFES.id,
          }),
        }),
      ),
    )
    expect(toast.success).toHaveBeenCalledWith(
      'Règle enregistrée',
      expect.anything(),
    )
  })

  it('shows why a test failed', async () => {
    api.categorizationRulesControllerPreview.mockImplementation(() =>
      fail(400, 'labelPattern is not a valid regular expression: oops'),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Modifier la règle « CAFE TEST »',
      }),
    )
    const sheet = await screen.findByRole('dialog')
    await user.click(within(sheet).getByRole('button', { name: 'Tester' }))

    expect((await within(sheet).findByRole('alert')).textContent).toBe(
      'Cette expression régulière n’est pas valide.',
    )
  })

  it('applies the rules to existing transactions after confirmation', async () => {
    api.categorizationRulesControllerApply.mockImplementation(() =>
      ok({
        scanned: 9,
        matched: 7,
        unmatched: 2,
        updated: 4,
        manualSkipped: 3,
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('list', {
      name: 'Règles, dans l’ordre d’application',
    })
    await user.click(
      screen.getByRole('button', {
        name: /Appliquer aux opérations existantes/,
      }),
    )
    expect(api.categorizationRulesControllerApply).not.toHaveBeenCalled()
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Appliquer',
      }),
    )

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('4 opérations mises à jour.'),
    )
    expect(api.transactionsControllerReviewCount).toHaveBeenCalled()
  })

  it('deletes a rule after confirmation', async () => {
    api.categorizationRulesControllerRemove.mockImplementation(() =>
      Promise.resolve({
        data: undefined,
        response: new Response(null, { status: 204 }),
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Actions pour la règle « CAFE TEST »',
      }),
    )
    await user.click(
      await screen.findByRole('menuitem', { name: 'Supprimer…' }),
    )
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Supprimer',
      }),
    )

    await waitFor(() =>
      expect(api.categorizationRulesControllerRemove).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: 'r2' } }),
      ),
    )
    expect(toast.success).toHaveBeenCalledWith('Règle supprimée')
  })
})

describe('bodyFromForm', () => {
  const form = formFromRule(FAKEMART)

  it('reads amounts straight into cents and clears empty optional fields', () => {
    expect(
      bodyFromForm({
        ...form,
        minAmount: '-1 234,56',
        maxAmount: '',
        accountId: '',
        merchant: '  ',
        kind: 'transfer',
      }),
    ).toEqual({
      body: expect.objectContaining({
        minAmountCents: -123_456,
        maxAmountCents: null,
        accountId: null,
        merchant: null,
        kind: 'transfer',
      }),
    })
  })

  it('rejects an empty pattern, a bad amount and min above max', () => {
    expect(bodyFromForm({ ...form, labelPattern: '  ' })).toEqual({
      errors: { labelPattern: 'Saisissez un motif.' },
    })
    expect(bodyFromForm({ ...form, minAmount: 'abc' })).toEqual({
      errors: { amount: 'Saisissez un montant, par exemple -50 ou 12,90.' },
    })
    expect(bodyFromForm({ ...form, minAmount: '10', maxAmount: '5' })).toEqual({
      errors: { amount: 'Le minimum dépasse le maximum.' },
    })
  })
})
