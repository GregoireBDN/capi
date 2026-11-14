import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '#/api'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { getReviewCount, resetReviewCount } from '#/lib/review-count'
import { ReviewQueue } from './ReviewQueue'

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const euros = (cents: number) => formatCents(cents).replace(/\s/g, ' ')

vi.mock('#/api', () => ({
  categoriesControllerList: vi.fn(),
  transactionsControllerList: vi.fn(),
  transactionsControllerUpdate: vi.fn(),
  transactionsControllerBulkUpdate: vi.fn(),
  transactionsControllerReviewCount: vi.fn(),
  categorizationRulesControllerSuggest: vi.fn(),
  categorizationRulesControllerPreview: vi.fn(),
  categorizationRulesControllerCreate: vi.fn(),
  categorizationRulesControllerApply: vi.fn(),
}))

const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)
vi.mock('sonner', () => ({ toast: toastMock }))

const mocked = vi.mocked(api)

/** Synthetic data only. */
const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001'
const categories: CategoryDto[] = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    slug: 'groceries',
    name: 'Courses',
    kind: 'expense',
    color: '#d97706',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    slug: 'salary',
    name: 'Salaire',
    kind: 'income',
    color: '#16a34a',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    slug: 'savings_transfer',
    name: 'Épargne',
    kind: 'transfer',
    color: '#0284c7',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  },
]
const [groceries, , savings] = categories

function transaction(
  id: number,
  overrides: Partial<TransactionDto> = {},
): TransactionDto {
  return {
    id: `a0000000-0000-4000-8000-00000000000${id}`,
    accountId: ACCOUNT_ID,
    accountName: 'Compte test',
    importId: null,
    bookingDate: `2026-10-0${id}`,
    valueDate: null,
    amountCents: -1_234,
    rawLabel: `PAIEMENT CB FAKESHOP ${id}`,
    merchant: null,
    kind: 'expense',
    categoryId: null,
    category: null,
    ruleId: null,
    needsReview: true,
    isOneOff: false,
    note: null,
    manual: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

// Newest first, as the API returns them.
const newest = transaction(3, {
  rawLabel: 'VIR SEPA RECU FAKE EMPLOYER',
  amountCents: 250_000,
  kind: 'income',
})
const middle = transaction(2, {
  merchant: 'Fakemart',
  rawLabel: 'PAIEMENT CB 0210 FAKEMART TESTVILLE',
  categoryId: groceries.id,
  category: {
    id: groceries.id,
    slug: groceries.slug,
    name: groceries.name,
    color: groceries.color,
    kind: groceries.kind,
  },
  ruleId: 'r0000000-0000-4000-8000-000000000001',
})
const oldest = transaction(1, { rawLabel: 'PAIEMENT CB FAKECAFE' })
const queue = [newest, middle, oldest]

function ok<T>(data: T) {
  return Promise.resolve({ data }) as never
}
const failed = () => Promise.resolve({ data: undefined }) as never

function listResult(items: TransactionDto[], total = items.length) {
  return ok({ items, total, page: 1, limit: 50 })
}

function lastToastAction(fn: typeof toastMock.success) {
  const options = fn.mock.calls.at(-1)?.[1] as {
    action?: { label: string; onClick: () => void }
  }
  return options.action!
}

async function renderQueue(items = queue) {
  mocked.transactionsControllerList.mockReturnValue(listResult(items))
  const user = userEvent.setup()
  render(<ReviewQueue />)
  if (items.length > 0) {
    await screen.findByRole('list', { name: 'Opérations à revoir' })
  }
  return user
}

function itemFor(transactionDto: TransactionDto) {
  return screen.getByRole('listitem', { name: transactionDto.rawLabel })
}

function queuedLabels() {
  return within(screen.getByRole('list', { name: 'Opérations à revoir' }))
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('aria-label'))
}

beforeEach(() => {
  vi.clearAllMocks()
  resetReviewCount()
  mocked.categoriesControllerList.mockReturnValue(ok(categories))
  mocked.transactionsControllerReviewCount.mockReturnValue(ok({ count: 3 }))
  mocked.transactionsControllerUpdate.mockImplementation(({ path }) =>
    ok({ ...queue.find((t) => t.id === path.id)! }),
  )
  mocked.transactionsControllerBulkUpdate.mockReturnValue(ok({ updated: 2 }))
})

describe('ReviewQueue', () => {
  it('lists the queued transactions with their details', async () => {
    await renderQueue()

    expect(mocked.transactionsControllerList).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { needsReview: true, page: 1, limit: 50 },
      }),
    )
    expect(queuedLabels()).toEqual(queue.map((t) => t.rawLabel))
    expect(
      screen.getByText(
        '3 opérations à vérifier : catégorisez-les ou validez-les.',
      ),
    ).toBeInTheDocument()

    const item = within(itemFor(middle))
    expect(item.getByText('Fakemart')).toBeInTheDocument()
    expect(item.getByText('2 oct. 2026')).toBeInTheDocument()
    expect(item.getByText(/Compte test/)).toBeInTheDocument()
    expect(item.getByText(euros(-1_234))).toHaveClass('text-red-600')
    expect(item.getByText('Courses', { selector: 'span' })).toBeInTheDocument()
    expect(within(itemFor(newest)).getByText(euros(250_000))).toHaveClass(
      'text-green-700',
    )
    // The badge store follows the queue size.
    expect(getReviewCount()).toBe(3)

    // Categories grouped by kind.
    const picker = within(itemFor(oldest)).getByRole('combobox', {
      name: `Catégorie de ${oldest.rawLabel}`,
    })
    const groups = picker.querySelectorAll('optgroup')
    expect([...groups].map((g) => g.label)).toEqual([
      'Dépenses',
      'Revenus',
      'Mouvements internes',
    ])
  })

  it('files a transaction under a category and takes it out of the queue', async () => {
    const user = await renderQueue()

    await user.selectOptions(
      within(itemFor(oldest)).getByRole('combobox', {
        name: `Catégorie de ${oldest.rawLabel}`,
      }),
      'Courses',
    )

    expect(mocked.transactionsControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: oldest.id },
        body: { categoryId: groceries.id },
      }),
    )
    expect(queuedLabels()).toEqual([newest.rawLabel, middle.rawLabel])
    expect(getReviewCount()).toBe(2)
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(
        'Classée dans « Courses »',
        expect.objectContaining({
          action: expect.objectContaining({ label: 'Annuler' }),
        }),
      ),
    )
  })

  it('marks an item as an internal transfer and as one-off without leaving the queue', async () => {
    const user = await renderQueue()
    const item = within(itemFor(oldest))

    await user.selectOptions(
      item.getByRole('combobox', { name: `Type de ${oldest.rawLabel}` }),
      'Virement interne',
    )
    await user.click(item.getByRole('switch'))

    expect(mocked.transactionsControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: oldest.id },
        body: { kind: 'transfer' },
      }),
    )
    expect(mocked.transactionsControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: oldest.id },
        body: { isOneOff: true },
      }),
    )
    expect(queuedLabels()).toHaveLength(3)
  })

  it('validates an item that already has a category', async () => {
    const user = await renderQueue()

    expect(
      within(itemFor(oldest)).getByRole('button', {
        name: `Valider ${oldest.rawLabel}`,
      }),
    ).toBeDisabled()
    await user.click(
      within(itemFor(middle)).getByRole('button', {
        name: `Valider ${middle.rawLabel}`,
      }),
    )

    expect(mocked.transactionsControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: middle.id },
        body: { needsReview: false },
      }),
    )
    expect(queuedLabels()).toEqual([newest.rawLabel, oldest.rawLabel])
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(
        'Opération validée',
        expect.anything(),
      ),
    )
  })

  it('undoes a correction, restoring the rule categorization', async () => {
    const user = await renderQueue()

    await user.selectOptions(
      within(itemFor(middle)).getByRole('combobox', {
        name: `Catégorie de ${middle.rawLabel}`,
      }),
      'Épargne',
    )
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled())
    expect(queuedLabels()).not.toContain(middle.rawLabel)
    expect(
      screen.getByRole('region', { name: 'Créer une règle' }),
    ).toBeInTheDocument()

    lastToastAction(toastMock.success).onClick()

    await waitFor(() => expect(queuedLabels()).toContain(middle.rawLabel))
    expect(queuedLabels()).toEqual(queue.map((t) => t.rawLabel))
    expect(mocked.transactionsControllerUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: { id: middle.id },
        body: {
          categoryId: groceries.id,
          ruleId: middle.ruleId,
          kind: 'expense',
          isOneOff: false,
          needsReview: true,
        },
      }),
    )
    // The rule offer was about the undone correction.
    expect(
      screen.queryByRole('region', { name: 'Créer une règle' }),
    ).not.toBeInTheDocument()
  })

  it('puts the item back when the API refuses the change', async () => {
    mocked.transactionsControllerUpdate.mockReturnValue(failed())
    const user = await renderQueue()

    await user.selectOptions(
      within(itemFor(oldest)).getByRole('combobox', {
        name: `Catégorie de ${oldest.rawLabel}`,
      }),
      'Courses',
    )

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    expect(queuedLabels()).toEqual(queue.map((t) => t.rawLabel))
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it('creates a rule from a correction and reloads the queue', async () => {
    mocked.categorizationRulesControllerSuggest.mockReturnValue(
      ok({
        enabled: true,
        matchType: 'contains',
        labelPattern: 'FAKECAFE',
        accountId: null,
        minAmountCents: null,
        maxAmountCents: null,
        categoryId: groceries.id,
        kind: null,
        merchant: null,
      }),
    )
    mocked.categorizationRulesControllerPreview.mockImplementation(({ body }) =>
      ok(
        body.labelPattern === 'CAFE'
          ? { matched: 3, leavingReview: 2 }
          : { matched: 1, leavingReview: 1 },
      ),
    )
    mocked.categorizationRulesControllerCreate.mockReturnValue(
      ok({ id: 'r0000000-0000-4000-8000-000000000009' }),
    )
    mocked.categorizationRulesControllerApply.mockReturnValue(
      ok({
        scanned: 4,
        matched: 3,
        unmatched: 1,
        updated: 2,
        manualSkipped: 0,
      }),
    )
    const user = await renderQueue()

    await user.selectOptions(
      within(itemFor(oldest)).getByRole('combobox', {
        name: `Catégorie de ${oldest.rawLabel}`,
      }),
      'Courses',
    )
    await user.click(
      await screen.findByRole('button', {
        name: 'Créer une règle pour les opérations similaires',
      }),
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'Créer une règle',
    })
    expect(mocked.categorizationRulesControllerSuggest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          rawLabel: oldest.rawLabel,
          merchant: null,
          amountCents: oldest.amountCents,
          accountId: ACCOUNT_ID,
          categoryId: groceries.id,
        },
      }),
    )
    const input = within(dialog).getByLabelText(
      'Le libellé ou le marchand contient',
    )
    await waitFor(() => expect(input).toHaveValue('FAKECAFE'))
    expect(
      await within(dialog).findByText(
        '1 opération à revoir sera recatégorisée.',
      ),
    ).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'CAFE')
    expect(
      await within(dialog).findByText(
        '2 opérations à revoir seront recatégorisées (3 opérations au total).',
      ),
    ).toBeInTheDocument()
    expect(
      mocked.categorizationRulesControllerPreview,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: {
          matchType: 'contains',
          labelPattern: 'CAFE',
          categoryId: groceries.id,
          kind: null,
        },
      }),
    )

    mocked.transactionsControllerList.mockReturnValue(listResult([newest], 1))
    await user.click(
      within(dialog).getByRole('button', { name: 'Créer la règle' }),
    )

    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(
        'Règle créée : 2 opérations recatégorisées',
      ),
    )
    expect(mocked.categorizationRulesControllerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          matchType: 'contains',
          labelPattern: 'CAFE',
          categoryId: groceries.id,
          kind: null,
        },
      }),
    )
    expect(mocked.categorizationRulesControllerApply).toHaveBeenCalled()
    await waitFor(() => expect(queuedLabels()).toEqual([newest.rawLabel]))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Créer une règle' }),
    ).not.toBeInTheDocument()
  })

  it('files several selected items at once, with undo', async () => {
    const user = await renderQueue()

    await user.click(
      screen.getByRole('checkbox', { name: `Sélectionner ${newest.rawLabel}` }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: `Sélectionner ${oldest.rawLabel}` }),
    )
    const bar = within(screen.getByRole('region', { name: 'Actions groupées' }))
    expect(bar.getByText('2 opérations sélectionnées')).toBeInTheDocument()
    // One of them has no category yet: validating would leave it unfiled.
    expect(
      bar.getByRole('button', { name: 'Valider la sélection' }),
    ).toBeDisabled()

    await user.selectOptions(
      bar.getByRole('combobox', { name: 'Classer la sélection dans' }),
      'Épargne',
    )

    expect(mocked.transactionsControllerBulkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { categoryId: savings.id, ids: [newest.id, oldest.id] },
      }),
    )
    expect(queuedLabels()).toEqual([middle.rawLabel])
    expect(
      screen.queryByRole('region', { name: 'Actions groupées' }),
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(
        '2 opérations classées dans « Épargne »',
        expect.anything(),
      ),
    )

    // Undo: each item goes back to its own previous state.
    lastToastAction(toastMock.success).onClick()
    await waitFor(() => expect(queuedLabels()).toHaveLength(3))
    expect(mocked.transactionsControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: newest.id },
        body: {
          categoryId: null,
          kind: 'income',
          isOneOff: false,
          needsReview: true,
        },
      }),
    )
    expect(mocked.transactionsControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: oldest.id },
        body: {
          categoryId: null,
          kind: 'expense',
          isOneOff: false,
          needsReview: true,
        },
      }),
    )
  })

  it('validates a selection of categorized items', async () => {
    const user = await renderQueue()

    await user.click(
      screen.getByRole('checkbox', { name: `Sélectionner ${middle.rawLabel}` }),
    )
    await user.click(
      within(
        screen.getByRole('region', { name: 'Actions groupées' }),
      ).getByRole('button', { name: 'Valider la sélection' }),
    )

    expect(mocked.transactionsControllerBulkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { needsReview: false, ids: [middle.id] },
      }),
    )
    expect(queuedLabels()).toEqual([newest.rawLabel, oldest.rawLabel])
  })

  it('selects every loaded item', async () => {
    const user = await renderQueue()

    await user.click(
      screen.getByRole('checkbox', { name: 'Tout sélectionner' }),
    )

    expect(screen.getByText('3 opérations sélectionnées')).toBeInTheDocument()
  })

  it('shows an empty state when nothing is left to review', async () => {
    await renderQueue([])

    expect(await screen.findByText('Tout est à jour')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('loads more items without skipping any', async () => {
    mocked.transactionsControllerList.mockReturnValueOnce(
      listResult([newest, middle], 3),
    )
    const user = userEvent.setup()
    render(<ReviewQueue />)
    await screen.findByRole('list', { name: 'Opérations à revoir' })

    mocked.transactionsControllerList.mockReturnValueOnce(
      listResult([newest, middle, oldest], 3),
    )
    await user.click(screen.getByRole('button', { name: /Charger plus/ }))

    await waitFor(() =>
      expect(queuedLabels()).toEqual(queue.map((t) => t.rawLabel)),
    )
    expect(
      screen.queryByRole('button', { name: /Charger plus/ }),
    ).not.toBeInTheDocument()
  })
})
