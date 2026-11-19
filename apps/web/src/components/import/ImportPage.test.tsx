import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportPage } from './ImportPage'
import {
  account,
  categories,
  committedSummary,
  fail,
  networkFailure,
  ok,
  pendingDetail,
  renderWithClient,
} from './test-fixtures'

const api = vi.hoisted(() => ({
  accountsControllerList: vi.fn(),
  accountsControllerCreate: vi.fn(),
  categoriesControllerList: vi.fn(),
  importsControllerList: vi.fn(),
  importsControllerPreview: vi.fn(),
  importsControllerCommit: vi.fn(),
  importsControllerRemove: vi.fn(),
  importsControllerFindOne: vi.fn(),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
  }: {
    to: string
    search?: Record<string, string | boolean>
    children: ReactNode
  }) => (
    <a
      href={
        search
          ? `${to}?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)]))}`
          : to
      }
    >
      {children}
    </a>
  ),
}))

function csv(name = 'export.csv', type = 'text/csv') {
  return new File(['Date;Date de valeur;Débit;Crédit;Libellé;Solde'], name, {
    type,
  })
}

function setup() {
  const user = userEvent.setup({ applyAccept: false })
  renderWithClient(<ImportPage />)
  return { user }
}

async function uploadPreview(user: ReturnType<typeof userEvent.setup>) {
  api.importsControllerPreview.mockResolvedValue(ok(pendingDetail))
  await user.upload(await screen.findByLabelText('Fichier CSV'), csv())
  return screen.findByRole('region', { name: 'Opérations du fichier' })
}

function rowEl(index: number) {
  return screen.getByTestId(`row-${index}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.accountsControllerList.mockResolvedValue(ok([account]))
  api.categoriesControllerList.mockResolvedValue(ok(categories))
  api.importsControllerList.mockResolvedValue(ok([]))
})

describe('ImportPage — first account', () => {
  it('creates the first transactional account, then offers the upload', async () => {
    api.accountsControllerList.mockResolvedValueOnce(ok([]))
    api.accountsControllerCreate.mockResolvedValue(ok(account))
    const { user } = setup()

    const name = await screen.findByLabelText('Nom du compte')
    expect(screen.getByLabelText('Banque')).toHaveValue('CIC')
    await user.clear(name)
    await user.type(name, 'Livret test')
    await user.selectOptions(screen.getByLabelText('Type'), 'savings')
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))

    await waitFor(() =>
      expect(api.accountsControllerCreate).toHaveBeenCalledWith({
        body: { name: 'Livret test', type: 'savings', institution: 'CIC' },
        throwOnError: false,
      }),
    )
    expect(await screen.findByLabelText('Fichier CSV')).toBeInTheDocument()
    expect(screen.getByLabelText('Compte')).toHaveValue(account.id)
  })

  it('ignores investment accounts', async () => {
    api.accountsControllerList.mockResolvedValue(
      ok([{ ...account, id: 'pea', type: 'brokerage', name: 'PEA test' }]),
    )
    setup()
    expect(
      await screen.findByText('Créez votre premier compte'),
    ).toBeInTheDocument()
  })
})

describe('ImportPage — upload errors', () => {
  it.each([
    [
      fail(400, 'Not a CIC CSV export: missing column(s) Solde'),
      /n’est pas un export CSV CIC/,
    ],
    [
      fail(
        400,
        'Bank exports can only be imported into a checking or savings account',
      ),
      /compte courant ou un livret/,
    ],
    [fail(413, 'The file exceeds the 5 MB limit'), /taille maximale de 5 Mo/],
    [networkFailure(), /Impossible de joindre le serveur/],
  ])('shows a clear message (%#)', async (result, message) => {
    api.importsControllerPreview.mockResolvedValue(result)
    const { user } = setup()

    await user.upload(await screen.findByLabelText('Fichier CSV'), csv())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    expect(api.importsControllerPreview).toHaveBeenCalledWith({
      body: {
        file: expect.any(File),
        accountId: account.id,
        source: 'cic_csv',
      },
      throwOnError: false,
    })
  })

  it('rejects a non-CSV file without calling the API', async () => {
    const { user } = setup()
    await user.upload(
      await screen.findByLabelText('Fichier CSV'),
      csv('releve.pdf', 'application/pdf'),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/fichier \.csv/)
    expect(api.importsControllerPreview).not.toHaveBeenCalled()
  })
})

describe('ImportPage — preview', () => {
  it('shows the summary, continuity, parse issues and rows to process', async () => {
    const { user } = setup()
    const rows = await uploadPreview(user)

    const summary = screen.getByRole('region', { name: 'Résumé' })
    expect(
      within(summary).getByText('Nouvelles').nextSibling,
    ).toHaveTextContent('2')
    expect(within(summary).getByText('Doublons').nextSibling).toHaveTextContent(
      '1',
    )
    expect(
      within(summary).getByText('À confirmer').nextSibling,
    ).toHaveTextContent('1')
    expect(
      within(summary).getByText('Lignes illisibles').nextSibling,
    ).toHaveTextContent('1')
    expect(summary).toHaveTextContent('du 02/03/2026 au 05/03/2026')

    expect(
      screen.getByText('Des opérations semblent manquer'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Entre le 03\/03\/2026 et le 04\/03\/2026 \(ligne 4\)/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Ligne 7 : Date invalide ou manquante/),
    ).toBeInTheDocument()
    expect(screen.queryByText('Fichier déjà importé')).not.toBeInTheDocument()

    // Default filter: new rows and conflicts; the duplicate is hidden.
    expect(within(rows).getByText('CB FAKE BAKERY')).toBeInTheDocument()
    expect(within(rowEl(0)).getByText('Nouvelle')).toBeInTheDocument()
    expect(within(rowEl(2)).getByText('À confirmer')).toBeInTheDocument()
    expect(within(rows).queryByText('CB FAKE GARAGE')).not.toBeInTheDocument()

    await user.click(within(rows).getByRole('radio', { name: /Doublons/ }))
    expect(within(rowEl(3)).getByText('Doublon')).toBeInTheDocument()
    expect(within(rows).queryByText('CB FAKE BAKERY')).not.toBeInTheDocument()
  })

  it('shows the stored transaction next to a conflict, skipped by default', async () => {
    const { user } = setup()
    const rows = await uploadPreview(user)

    expect(within(rows).getByText('FAKE CINEMA SHEET')).toBeInTheDocument()
    expect(
      within(rows).getByText(/Même montant, 1 jour d’écart/),
    ).toBeInTheDocument()
    const decision = within(rows).getByRole('radiogroup', {
      name: /Décision pour/,
    })
    expect(
      within(decision).getByRole('radio', { name: 'Ignorer' }),
    ).toBeChecked()
    expect(
      within(decision).getByRole('radio', { name: 'Importer' }),
    ).not.toBeChecked()
    // A skipped row's category cannot be edited.
    expect(
      screen.getByLabelText('Catégorie de « CB FAKE CINEMA »'),
    ).toBeDisabled()
    expect(
      screen.getByText('2 opérations seront importées.'),
    ).toBeInTheDocument()
  })

  it('warns when the same file was already imported', async () => {
    const { user } = setup()
    api.importsControllerPreview.mockResolvedValue(
      ok({
        ...pendingDetail,
        alreadyImported: {
          importId: committedSummary.id,
          committedAt: '2026-03-01T09:01:00.000Z',
        },
      }),
    )
    await user.upload(await screen.findByLabelText('Fichier CSV'), csv())
    expect(await screen.findByText('Fichier déjà importé')).toBeInTheDocument()
  })

  it('commits the conflict decisions and the category overrides of imported rows', async () => {
    api.importsControllerCommit.mockResolvedValue(
      ok({
        ...pendingDetail,
        status: 'committed',
        committedAt: '2026-04-01T08:05:00.000Z',
        preview: null,
        counts: { ...pendingDetail.counts, inserted: 3, skipped: 0 },
      }),
    )
    const { user } = setup()
    await uploadPreview(user)

    // Category picked for a new row, then for the conflict once imported.
    await user.selectOptions(
      screen.getByLabelText('Catégorie de « CB FAKE BAKERY »'),
      'cat-fun',
    )
    await user.click(screen.getByRole('radio', { name: 'Importer' }))
    await user.selectOptions(
      screen.getByLabelText('Catégorie de « CB FAKE CINEMA »'),
      'cat-fun',
    )
    expect(
      screen.getByText('3 opérations seront importées.'),
    ).toBeInTheDocument()

    const historyCalls = api.importsControllerList.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Confirmer l’import' }))

    await waitFor(() =>
      expect(api.importsControllerCommit).toHaveBeenCalledWith({
        path: { id: pendingDetail.id },
        body: {
          conflictResolutions: [{ rowIndex: 2, action: 'import' }],
          categoryOverrides: [
            { rowIndex: 0, categoryId: 'cat-fun' },
            { rowIndex: 2, categoryId: 'cat-fun' },
          ],
        },
        throwOnError: false,
      }),
    )
    expect(await screen.findByText('Import terminé')).toBeInTheDocument()
    expect(
      screen.getByText(/3 opérations ajoutées à Compte test/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Voir les opérations' }),
    ).toHaveAttribute('href', '/transactions')
    // The uncategorized salary row goes to « À revoir » in Opérations.
    expect(screen.getByRole('link', { name: 'À revoir' })).toHaveAttribute(
      'href',
      '/transactions?review=true&month=all',
    )
    // History and balances are refetched.
    await waitFor(() =>
      expect(api.importsControllerList.mock.calls.length).toBeGreaterThan(
        historyCalls,
      ),
    )
    expect(api.accountsControllerList.mock.calls.length).toBeGreaterThan(1)
  })

  it('discards the pending import on cancel', async () => {
    api.importsControllerRemove.mockResolvedValue(
      ok({ id: pendingDetail.id, result: 'discarded', removedTransactions: 0 }),
    )
    const { user } = setup()
    await uploadPreview(user)

    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    await waitFor(() =>
      expect(api.importsControllerRemove).toHaveBeenCalledWith({
        path: { id: pendingDetail.id },
        throwOnError: false,
      }),
    )
    expect(await screen.findByLabelText('Fichier CSV')).toBeInTheDocument()
    expect(api.importsControllerCommit).not.toHaveBeenCalled()
  })

  it('renders stacked cards below the laptop breakpoint', async () => {
    const { user } = setup()
    const rows = await uploadPreview(user)
    expect(within(rows).queryByRole('table')).not.toBeInTheDocument()
    expect(within(rows).getAllByRole('listitem')).toHaveLength(3)
  })

  it('renders a table on a wide screen', async () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('min-width: 1280px'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    )
    const { user } = setup()
    const rows = await uploadPreview(user)
    expect(within(rows).getByRole('table')).toBeInTheDocument()
    expect(
      within(rows)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Statut', 'Date', 'Libellé', 'Montant', 'Catégorie'])
    matchMedia.mockRestore()
  })
})

describe('ImportPage — history', () => {
  it('undoes a committed import after confirmation', async () => {
    api.importsControllerList.mockResolvedValue(ok([committedSummary]))
    api.importsControllerRemove.mockResolvedValue(
      ok({
        id: committedSummary.id,
        result: 'undone',
        removedTransactions: 12,
      }),
    )
    const { user } = setup()

    const item = await screen.findByRole('listitem', {
      name: 'Import old-export.csv',
    })
    expect(item).toHaveTextContent('Validé')
    expect(item).toHaveTextContent('du 01/02/2026 au 28/02/2026')
    expect(item).toHaveTextContent('12 ajoutées')

    await user.click(
      within(item).getByRole('button', { name: 'Annuler l’import' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(
      '12 opérations ajoutées par « old-export.csv »',
    )
    expect(api.importsControllerRemove).not.toHaveBeenCalled()

    await user.click(
      within(dialog).getByRole('button', { name: 'Annuler l’import' }),
    )

    await waitFor(() =>
      expect(api.importsControllerRemove).toHaveBeenCalledWith({
        path: { id: committedSummary.id },
        throwOnError: false,
      }),
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Import annulé : 12 opérations supprimées',
      ),
    )
  })

  it('keeps the import when the dialog is dismissed', async () => {
    api.importsControllerList.mockResolvedValue(ok([committedSummary]))
    const { user } = setup()
    const item = await screen.findByRole('listitem', {
      name: 'Import old-export.csv',
    })
    await user.click(
      within(item).getByRole('button', { name: 'Annuler l’import' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Conserver' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(api.importsControllerRemove).not.toHaveBeenCalled()
  })

  it('resumes a pending import', async () => {
    api.importsControllerList.mockResolvedValue(
      ok([
        { ...pendingDetail, alreadyImported: undefined, preview: undefined },
      ]),
    )
    api.importsControllerFindOne.mockResolvedValue(ok(pendingDetail))
    const { user } = setup()
    const item = await screen.findByRole('listitem', {
      name: 'Import export-test.csv',
    })
    expect(item).toHaveTextContent('En attente')
    await user.click(within(item).getByRole('button', { name: 'Reprendre' }))
    expect(
      await screen.findByRole('region', { name: 'Opérations du fichier' }),
    ).toBeInTheDocument()
  })
})
