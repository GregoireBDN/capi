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
  CategorizationRuleMatchesDto,
  CategorizationRulePreviewDto,
  CategorizationRulesInsightsDto,
  CategoryDto,
} from '#/api/types.gen'
import { bodyFromForm, formFromRule } from './RuleEditorSheet'
import { groupRules, RulesPage } from './RulesPage'

const api = vi.hoisted(() => ({
  categorizationRulesControllerList: vi.fn(),
  categorizationRulesControllerInsights: vi.fn(),
  categorizationRulesControllerMatches: vi.fn(),
  categorizationRulesControllerCreate: vi.fn(),
  categorizationRulesControllerUpdate: vi.fn(),
  categorizationRulesControllerRemove: vi.fn(),
  categorizationRulesControllerPrefer: vi.fn(),
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
    icon: null,
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
const SALARY = category('c4', 'Salaire', 'income')

const ACCOUNT: AccountDto = {
  id: 'a1',
  name: 'Compte test',
  type: 'checking',
  institution: null,
  position: 0,
  archivedAt: null,
  balanceCents: null,
  balanceDate: null,
  cryptoSource: null,
  cryptoProvider: null,
  cryptoSyncedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function rule(
  id: string,
  rank: number,
  labelPattern: string,
  overrides: Partial<CategorizationRuleDto> = {},
): CategorizationRuleDto {
  return {
    id,
    position: rank,
    priority: 0,
    rank,
    enabled: true,
    matchType: 'contains',
    labelPattern,
    accountId: null,
    minAmountCents: null,
    maxAmountCents: null,
    categoryId: GROCERIES.id,
    kind: null,
    merchant: null,
    counterpartAccountId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const EXPRESS = rule('r1', 0, 'FAKEMART EXPRESS', { categoryId: CAFES.id })
const FAKEMART = rule('r2', 1, 'FAKEMART', {
  accountId: ACCOUNT.id,
  minAmountCents: -5_000,
  maxAmountCents: -100,
})
const ARCHIVED = rule('r3', 2, 'FLEUR TEST', {
  categoryId: OLD.id,
  enabled: false,
})
const PAY = rule('r4', 3, 'SALAIRE TEST', { categoryId: SALARY.id })

const INSIGHTS: CategorizationRulesInsightsDto = {
  since: '2025-11-19',
  rules: [
    { ruleId: EXPRESS.id, matchCount: 12 },
    { ruleId: FAKEMART.id, matchCount: 42 },
    { ruleId: ARCHIVED.id, matchCount: 0 },
    { ruleId: PAY.id, matchCount: 1 },
  ],
  conflicts: [{ winnerRuleId: EXPRESS.id, loserRuleId: FAKEMART.id, count: 3 }],
}

const EMPTY_PREVIEW: CategorizationRulePreviewDto = {
  matched: 0,
  leavingReview: 0,
  released: 0,
  changed: 0,
  transactions: [],
  conflicts: [],
}

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

/** `text` with non-breaking spaces inside its guillemets, as the page writes them. */
function nbsp(text: string): string {
  return text.replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»')
}

/** The editor's step heading: its name and « n/3 ». */
function stepHeading(sheet: HTMLElement): string | null {
  return within(sheet).getByRole('heading', { level: 3 }).textContent
}

/** The action of the last success toast, as a callback. */
function lastToastAction(): () => void {
  const options = toast.success.mock.calls.at(-1)?.[1] as {
    action: { onClick: () => void }
  }
  return options.action.onClick
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.setPointerCapture = vi.fn()
  // jsdom has no PointerEvent: a MouseEvent carries clientY and button.
  if (!('PointerEvent' in globalThis)) {
    Object.assign(globalThis, {
      PointerEvent: class extends MouseEvent {
        pointerId = 1
      },
    })
  }
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
  api.categorizationRulesControllerList.mockImplementation(() =>
    ok([EXPRESS, FAKEMART, ARCHIVED, PAY]),
  )
  api.categorizationRulesControllerInsights.mockImplementation(() =>
    ok(INSIGHTS),
  )
  api.categoriesControllerList.mockImplementation(() =>
    ok([GROCERIES, CAFES, OLD, SALARY]),
  )
  api.accountsControllerList.mockImplementation(() => ok([ACCOUNT]))
  api.transactionsControllerReviewCount.mockImplementation(() =>
    ok({ count: 0 }),
  )
  api.categorizationRulesControllerApply.mockImplementation(() =>
    ok({ scanned: 10, matched: 8, unmatched: 2, updated: 4, manualSkipped: 1 }),
  )
  api.categorizationRulesControllerPreview.mockImplementation(() =>
    ok(EMPTY_PREVIEW),
  )
  api.categorizationRulesControllerUpdate.mockImplementation(
    ({ path, body }: { path: { id: string }; body: object }) =>
      ok({ ...FAKEMART, id: path.id, ...body }),
  )
  api.categorizationRulesControllerRemove.mockImplementation(() =>
    ok(undefined, 204),
  )
})

describe('RulesPage', () => {
  it('lists the rules as sentences by category, with their match counts', async () => {
    renderPage()

    const groups = await screen.findByRole('list', {
      name: 'Règles par catégorie',
    })
    // Expenses by name, then income.
    expect(
      within(groups)
        .getAllByRole('heading')
        .map((heading) => heading.textContent),
    ).toEqual(['Anciennearchivée', 'Cafés', 'Courses', 'Salaire'])

    const courses = screen.getByRole('list', { name: 'Règles vers Courses' })
    const row = within(courses).getByRole('button', {
      name: 'Libellé contient « FAKEMART » → Courses',
    })
    expect(row.textContent).toContain('42 opérations')
    expect(row.textContent).toContain('compte Compte test')
    expect(row.textContent).toContain('entre -50,00')

    const old = screen.getByRole('button', {
      name: 'Libellé contient « FLEUR TEST » → Ancienne',
    })
    expect(old.textContent).toContain('Aucune opération')
    expect(old.textContent).toContain('Désactivée')
    expect((await screen.findByRole('status')).textContent).toContain(
      '1 règle ne reconnaît aucune opération des 12 derniers mois',
    )

    // No manual ordering in the default view.
    expect(screen.queryByRole('button', { name: /Monter/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Descendre/ })).toBeNull()
    expect(screen.queryByTitle('Glisser pour déplacer')).toBeNull()
  })

  it('makes the overridden rule win in one tap, then applies, with undo', async () => {
    api.categorizationRulesControllerPrefer.mockImplementation(() =>
      ok({ ...FAKEMART, priority: 1, rank: 0 }),
    )
    const user = userEvent.setup()
    renderPage()

    const conflicts = await screen.findByRole('list', {
      name: 'Règles qui se recouvrent',
    })
    expect(conflicts.textContent).toContain(
      nbsp(
        '3 opérations correspondent aussi à la règle « FAKEMART » → Courses : « FAKEMART EXPRESS » → Cafés l’emporte.',
      ),
    )
    await user.click(
      within(conflicts).getByRole('button', {
        name: nbsp('Faire gagner « FAKEMART »'),
      }),
    )

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        '« FAKEMART » passe avant « FAKEMART EXPRESS »',
        expect.objectContaining({ description: '4 opérations reclassées.' }),
      ),
    )
    expect(api.categorizationRulesControllerPrefer).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: FAKEMART.id },
        body: { overRuleId: EXPRESS.id },
      }),
    )
    expect(api.categorizationRulesControllerApply).toHaveBeenCalledTimes(1)

    lastToastAction()()
    await waitFor(() =>
      expect(api.categorizationRulesControllerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: FAKEMART.id },
          body: { priority: 0 },
        }),
      ),
    )
    expect(api.categorizationRulesControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: EXPRESS.id },
        body: { priority: 0 },
      }),
    )
    await waitFor(() =>
      expect(api.categorizationRulesControllerApply).toHaveBeenCalledTimes(2),
    )
  })

  it('creates a rule in three steps, with the matches shown before saving', async () => {
    const matches: CategorizationRuleMatchesDto = {
      since: '2025-11-19',
      total: 2,
      transactions: [
        {
          id: 't1',
          bookingDate: '2026-11-03',
          accountId: ACCOUNT.id,
          rawLabel: 'CB CAFE DU COIN 0311',
          merchant: null,
          amountCents: -450,
          categoryId: null,
          manual: false,
        },
        {
          id: 't2',
          bookingDate: '2026-10-20',
          accountId: ACCOUNT.id,
          rawLabel: 'CB CAFE DU COIN 2010',
          merchant: null,
          amountCents: -380,
          categoryId: GROCERIES.id,
          manual: true,
        },
      ],
    }
    api.categorizationRulesControllerMatches.mockImplementation(() =>
      ok(matches),
    )
    const created = rule('r9', 1, 'CAFE DU COIN', { categoryId: CAFES.id })
    api.categorizationRulesControllerCreate.mockImplementation(() =>
      ok(created),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      (await screen.findAllByRole('button', { name: 'Nouvelle règle' }))[0],
    )
    const sheet = await screen.findByRole('dialog')
    expect(stepHeading(sheet)).toBe('Quelles opérations ?1/3')
    const next = within(sheet).getByRole('button', { name: 'Suivant' })
    expect(next).toHaveProperty('disabled', true)

    // Step 1: the text, the matches listed live.
    await user.type(
      within(sheet).getByLabelText('Le libellé contient'),
      'CAFE DU COIN',
    )
    const found = await within(sheet).findByRole(
      'region',
      { name: 'Opérations reconnues' },
      { timeout: 2000 },
    )
    expect(found.textContent).toContain('2 opérations sur 12 mois')
    // The matches come right under the field, « Avancé » after them.
    const advancedToggle = within(sheet).getByRole('button', { name: /Avancé/ })
    expect(
      found.compareDocumentPosition(advancedToggle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      within(sheet)
        .getByLabelText('Le libellé contient')
        .getAttribute('placeholder'),
    ).toBe('Ex. : UBER EATS')
    expect(found.textContent).toContain('CB CAFE DU COIN 0311')
    expect(found.textContent).toContain('classée à la main, ne changera pas')
    expect(api.categorizationRulesControllerMatches).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: {
          matchType: 'contains',
          labelPattern: 'CAFE DU COIN',
          accountId: null,
          minAmountCents: null,
          maxAmountCents: null,
        },
      }),
    )
    await user.click(next)

    // Step 2: a category chip moves on.
    expect(stepHeading(sheet)).toBe('Classer dans2/3')
    await user.click(within(sheet).getByRole('button', { name: 'Cafés' }))

    // Step 3: the sentence and what changes, then save.
    expect(stepHeading(sheet)).toBe('Vérifier3/3')
    expect(sheet.textContent).toContain('Libellé contient « CAFE DU COIN »')
    await within(sheet).findByRole('region', { name: 'Ce qui change' })
    expect(api.categorizationRulesControllerPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          labelPattern: 'CAFE DU COIN',
          categoryId: CAFES.id,
          priority: 0,
        }),
      }),
    )
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Règle ajoutée',
        expect.objectContaining({ description: '4 opérations reclassées.' }),
      ),
    )
    expect(api.categorizationRulesControllerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          labelPattern: 'CAFE DU COIN',
          categoryId: CAFES.id,
          matchType: 'contains',
        }),
      }),
    )
    expect(api.categorizationRulesControllerApply).toHaveBeenCalledTimes(1)

    // « Annuler » removes the new rule and applies the rules again.
    lastToastAction()()
    await waitFor(() =>
      expect(api.categorizationRulesControllerRemove).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: 'r9' } }),
      ),
    )
  })

  it('opens an edit on its last step and fixes a conflict from the preview', async () => {
    api.categorizationRulesControllerPreview.mockImplementation(() =>
      ok({
        ...EMPTY_PREVIEW,
        matched: 5,
        conflicts: [
          { winnerRuleId: EXPRESS.id, loserRuleId: FAKEMART.id, count: 3 },
        ],
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Libellé contient « FAKEMART » → Courses',
      }),
    )
    const sheet = await screen.findByRole('dialog')
    expect(stepHeading(sheet)).toBe('Vérifier3/3')
    const overlaps = await within(sheet).findByRole('region', {
      name: 'Règles qui se recouvrent',
    })
    expect(overlaps.textContent).toContain(
      nbsp(
        '3 opérations correspondent aussi à la règle « FAKEMART EXPRESS » → Cafés, qui l’emporte.',
      ),
    )

    await user.click(
      within(overlaps).getByRole('button', {
        name: 'Faire gagner cette règle',
      }),
    )
    await waitFor(() =>
      expect(api.categorizationRulesControllerPreview).toHaveBeenLastCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ ruleId: FAKEMART.id, priority: 1 }),
        }),
      ),
    )
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.categorizationRulesControllerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: FAKEMART.id },
          body: expect.objectContaining({
            priority: 1,
            labelPattern: 'FAKEMART',
            accountId: ACCOUNT.id,
            minAmountCents: -5_000,
          }),
        }),
      ),
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Règle enregistrée',
        expect.anything(),
      ),
    )

    // « Annuler » puts the previous rule back.
    lastToastAction()()
    await waitFor(() =>
      expect(api.categorizationRulesControllerUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ priority: 0 }),
        }),
      ),
    )
  })

  it('goes back to a step from the review, and keeps the advanced conditions folded', async () => {
    api.categorizationRulesControllerMatches.mockImplementation(() =>
      ok({ since: '2025-11-19', total: 0, transactions: [] }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Libellé contient « FAKEMART » → Courses',
      }),
    )
    const sheet = await screen.findByRole('dialog')
    await user.click(within(sheet).getByRole('button', { name: /Opérations/ }))
    expect(stepHeading(sheet)).toBe('Quelles opérations ?1/3')
    const advanced = within(sheet).getByRole('button', { name: /Avancé/ })
    expect(advanced.getAttribute('aria-expanded')).toBe('false')
    expect(advanced.textContent).toContain('compte Compte test')
    expect(within(sheet).queryByLabelText('Montant minimum')).toBeNull()
    await user.click(advanced)
    expect(within(sheet).getByLabelText('Montant minimum')).toHaveProperty(
      'value',
      '-50',
    )
    expect(
      await within(sheet).findByText(
        'Aucune opération sur 12 mois',
        {},
        {
          timeout: 2000,
        },
      ),
    ).toBeTruthy()

    // The category is known: « Suivant » goes straight back to the review.
    await user.click(within(sheet).getByRole('button', { name: 'Suivant' }))
    expect(stepHeading(sheet)).toBe('Vérifier3/3')
  })

  it('shows why the preview failed', async () => {
    api.categorizationRulesControllerPreview.mockImplementation(() =>
      fail(400, 'labelPattern is not a valid regular expression: oops'),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Libellé contient « SALAIRE TEST » → Salaire',
      }),
    )
    const sheet = await screen.findByRole('dialog')
    expect((await within(sheet).findByRole('alert')).textContent).toBe(
      'Cette expression régulière n’est pas valide.',
    )
  })

  it('deletes a rule after confirmation, with undo', async () => {
    api.categorizationRulesControllerCreate.mockImplementation(() => ok(PAY))
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Libellé contient « SALAIRE TEST » → Salaire',
      }),
    )
    const sheet = await screen.findByRole('dialog')
    await user.click(
      within(sheet).getByRole('button', { name: 'Supprimer la règle' }),
    )
    const confirm = await screen.findByRole('dialog', {
      name: 'Supprimer la règle ?',
    })
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))

    await waitFor(() =>
      expect(api.categorizationRulesControllerRemove).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: PAY.id } }),
      ),
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Règle supprimée',
        expect.anything(),
      ),
    )
    lastToastAction()()
    await waitFor(() =>
      expect(api.categorizationRulesControllerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            labelPattern: 'SALAIRE TEST',
            categoryId: SALARY.id,
            priority: 0,
          }),
        }),
      ),
    )
  })

  it('lists the evaluation order under « Avancé », each rule opening its editor', async () => {
    const user = userEvent.setup()
    renderPage()

    const order = await screen.findByRole('list', {
      name: 'Ordre d’évaluation',
    })
    const rows = within(order)
      .getAllByRole('button')
      .filter(
        (button) => !button.getAttribute('aria-label')?.startsWith('Déplacer'),
      )
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      '1. Libellé contient « FAKEMART EXPRESS » → Cafés',
      '2. Libellé contient « FAKEMART » → Courses',
      '3. Libellé contient « FLEUR TEST » → Ancienne',
      '4. Libellé contient « SALAIRE TEST » → Salaire',
    ])
    expect(rows[2].textContent).toContain('Désactivée')
    expect(rows[0].textContent).not.toContain('priorité')

    await user.click(screen.getByText('Ordre d’évaluation'))
    await user.click(rows[1])
    const sheet = await screen.findByRole('dialog')
    expect(stepHeading(sheet)).toBe('Vérifier3/3')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(
      screen.getByRole('button', { name: 'Réappliquer toutes les règles' }),
    )
    const confirm = await screen.findByRole('dialog', {
      name: 'Réappliquer toutes les règles ?',
    })
    await user.click(
      within(confirm).getByRole('button', { name: 'Réappliquer' }),
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('4 opérations mises à jour.'),
    )
  })
})

describe('RulesPage evaluation order, by hand', () => {
  const order = [EXPRESS, FAKEMART, ARCHIVED, PAY].map((r) => r.id)

  beforeEach(() => {
    api.categorizationRulesControllerReorder.mockImplementation(
      ({ body }: { body: { ids: string[] } }) =>
        ok(
          body.ids.map((id, rank) => ({
            ...[EXPRESS, FAKEMART, ARCHIVED, PAY].find((r) => r.id === id)!,
            rank,
          })),
        ),
    )
  })

  it('moves a rule with the arrow keys, applies, then undoes', async () => {
    const user = userEvent.setup()
    renderPage()

    const handle = await screen.findByRole('button', {
      name: 'Déplacer « SALAIRE TEST », rang 4',
    })
    handle.focus()
    await user.keyboard('{ArrowUp}')

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Ordre modifié',
        expect.objectContaining({ description: '4 opérations reclassées.' }),
      ),
    )
    expect(api.categorizationRulesControllerReorder).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { ids: [EXPRESS.id, FAKEMART.id, PAY.id, ARCHIVED.id] },
      }),
    )
    expect(api.categorizationRulesControllerApply).toHaveBeenCalledTimes(1)

    lastToastAction()()
    await waitFor(() =>
      expect(api.categorizationRulesControllerReorder).toHaveBeenLastCalledWith(
        expect.objectContaining({ body: { ids: order } }),
      ),
    )
  })

  it('moves a rule by dragging its handle', async () => {
    renderPage()
    const list = await screen.findByRole('list', { name: 'Ordre d’évaluation' })
    // Rows 40px high, one under the other.
    within(list)
      .getAllByRole('listitem')
      .forEach((row, index) => {
        row.getBoundingClientRect = () =>
          ({ top: index * 40, height: 40, bottom: index * 40 + 40 }) as DOMRect
      })
    const handle = screen.getByRole('button', {
      name: 'Déplacer « FAKEMART EXPRESS », rang 1',
    })

    fireEvent.pointerDown(handle, { clientY: 20, button: 0 })
    // Past the middle of the third row: lands third.
    fireEvent.pointerMove(handle, { clientY: 105 })
    fireEvent.pointerUp(handle, { clientY: 105 })

    await waitFor(() =>
      expect(api.categorizationRulesControllerReorder).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { ids: [FAKEMART.id, ARCHIVED.id, EXPRESS.id, PAY.id] },
        }),
      ),
    )
  })

  it('does not move a rule dropped where it was', async () => {
    renderPage()
    const list = await screen.findByRole('list', { name: 'Ordre d’évaluation' })
    within(list)
      .getAllByRole('listitem')
      .forEach((row, index) => {
        row.getBoundingClientRect = () =>
          ({ top: index * 40, height: 40, bottom: index * 40 + 40 }) as DOMRect
      })
    const handle = screen.getByRole('button', {
      name: 'Déplacer « FAKEMART », rang 2',
    })
    fireEvent.pointerDown(handle, { clientY: 60, button: 0 })
    fireEvent.pointerMove(handle, { clientY: 70 })
    fireEvent.pointerUp(handle, { clientY: 70 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(api.categorizationRulesControllerReorder).not.toHaveBeenCalled()
  })
})

describe('groupRules', () => {
  it('puts an unknown category last', () => {
    const orphan = rule('r5', 4, 'GONE TEST', { categoryId: 'missing' })
    expect(
      groupRules([orphan, PAY, FAKEMART], [GROCERIES, SALARY]).map(
        (group) => group.category?.name ?? null,
      ),
    ).toEqual(['Courses', 'Salaire', null])
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
        priority: 0,
      }),
    })
  })

  it('sends a destination account only with transfers (#296)', () => {
    const withDestination = { ...form, counterpartAccountId: 'acc-pea' }
    expect(bodyFromForm({ ...withDestination, kind: 'transfer' })).toEqual({
      body: expect.objectContaining({ counterpartAccountId: 'acc-pea' }),
    })
    expect(bodyFromForm(withDestination, 'transfer')).toEqual({
      body: expect.objectContaining({ counterpartAccountId: 'acc-pea' }),
    })
    expect(bodyFromForm(withDestination, 'expense')).toEqual({
      body: expect.objectContaining({ counterpartAccountId: null }),
    })
  })

  it('rejects an empty pattern, no category, a bad amount and min above max', () => {
    expect(bodyFromForm({ ...form, labelPattern: '  ' })).toEqual({
      errors: { labelPattern: 'Saisissez un texte.' },
    })
    expect(bodyFromForm({ ...form, categoryId: '' })).toEqual({
      errors: { categoryId: 'Choisissez une catégorie.' },
    })
    expect(bodyFromForm({ ...form, minAmount: 'abc' })).toEqual({
      errors: { amount: 'Saisissez un montant, par exemple -50 ou 12,90.' },
    })
    expect(bodyFromForm({ ...form, minAmount: '10', maxAmount: '5' })).toEqual({
      errors: { amount: 'Le minimum dépasse le maximum.' },
    })
  })
})
