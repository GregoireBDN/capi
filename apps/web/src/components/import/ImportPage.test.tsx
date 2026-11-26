import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { categoryField, chooseCategory } from '#/test/category-picker'
import { ImportPage } from './ImportPage'
import {
  account,
  categories,
  committedDetail,
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
  importsControllerFixLine: vi.fn(),
  importsControllerUnfixLine: vi.fn(),
  importProfilesControllerList: vi.fn(),
  importProfilesControllerInspect: vi.fn(),
  importProfilesControllerCreate: vi.fn(),
  importProfilesControllerRemove: vi.fn(),
  importProfilesControllerUpdate: vi.fn(),
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

/** A line of the file in the preview (fixture rows are lines 2 to 5). */
function lineEl(lineNumber: number) {
  return screen.getByTestId(`line-${lineNumber}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.accountsControllerList.mockResolvedValue(ok([account]))
  api.categoriesControllerList.mockResolvedValue(ok(categories))
  api.importsControllerList.mockResolvedValue(ok([]))
  api.importProfilesControllerList.mockResolvedValue(ok([]))
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
      body: { file: expect.any(File), accountId: account.id },
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

describe('ImportPage — a file in no known format (#431)', () => {
  const inspection = {
    encoding: 'windows-1252' as const,
    delimiter: ';' as const,
    headers: ['Date opération', 'Libellé', 'Débit', 'Crédit', 'Catégorie'],
    sample: [['02/10/2026', 'CB CAFE FICTIF', '3,20', '', 'Sorties']],
    lineCount: 1,
    recognised: null,
    suggestion: {
      decimalSeparator: ',' as const,
      dateFormat: 'dd/mm/yyyy' as const,
      columns: {
        date: 'Date opération',
        label: 'Libellé',
        debit: 'Débit',
        credit: 'Crédit',
      },
    },
  }
  const profile = {
    id: 'profile-1',
    name: 'Banque fictive',
    target: 'cash' as const,
    encoding: 'windows-1252' as const,
    delimiter: ';' as const,
    decimalSeparator: ',' as const,
    dateFormat: 'dd/mm/yyyy' as const,
    headers: ['date operation', 'libelle', 'debit', 'credit', 'categorie'],
    columns: { date: 'date operation' },
    lastUsedAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
  }

  it('asks which column is which, saves the format and previews with it', async () => {
    api.importsControllerPreview
      .mockResolvedValueOnce(
        fail(
          400,
          'Unrecognised CSV format: neither a CIC export, the standard format nor a saved profile',
        ),
      )
      .mockResolvedValueOnce(ok(pendingDetail))
    api.importProfilesControllerInspect.mockResolvedValue(ok(inspection))
    api.importProfilesControllerCreate.mockResolvedValue(ok(profile))
    const { user } = setup()

    await user.upload(await screen.findByLabelText('Fichier CSV'), csv())
    expect(
      await screen.findByText('Nouveau format de relevé'),
    ).toBeInTheDocument()
    // The guesses are filled in; the sample helps check them.
    expect(screen.getByLabelText('Date')).toHaveValue('Date opération')
    expect(screen.getByLabelText('Débit')).toHaveValue('Débit')
    expect(screen.getByText('CB CAFE FICTIF')).toBeInTheDocument()

    const submit = screen.getByRole('button', {
      name: 'Enregistrer et prévisualiser',
    })
    // Named after the account's bank by default.
    const name = screen.getByLabelText('Nom du format')
    expect(name).toHaveValue(account.institution)
    await user.clear(name)
    expect(submit).toBeDisabled()
    expect(screen.getByText('Donnez un nom à ce format.')).toBeInTheDocument()
    await user.type(name, 'Banque fictive')
    await user.selectOptions(screen.getByLabelText('Libellé'), 'Date opération')
    expect(
      screen.getByText('Une même colonne est choisie deux fois.'),
    ).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Libellé'), 'Libellé')
    await user.click(submit)

    expect(
      await screen.findByRole('region', { name: 'Opérations du fichier' }),
    ).toBeInTheDocument()
    expect(api.importProfilesControllerCreate).toHaveBeenCalledWith({
      body: {
        name: 'Banque fictive',
        headers: inspection.headers,
        encoding: 'windows-1252',
        delimiter: ';',
        decimalSeparator: ',',
        dateFormat: 'dd/mm/yyyy',
        columns: {
          date: 'Date opération',
          label: 'Libellé',
          debit: 'Débit',
          credit: 'Crédit',
          balance: undefined,
          valueDate: undefined,
        },
      },
      throwOnError: false,
    })
    expect(api.importsControllerPreview).toHaveBeenLastCalledWith({
      body: {
        file: expect.any(File),
        accountId: account.id,
        profileId: 'profile-1',
      },
      throwOnError: false,
    })
  })

  it('changes the format a file was read with, from its preview (#433)', async () => {
    const saved = {
      ...profile,
      columns: {
        date: 'date operation',
        label: 'categorie',
        debit: 'debit',
        credit: 'credit',
      },
    }
    const readWith = {
      ...pendingDetail,
      source: 'csv_profile' as const,
      profileId: saved.id,
      profileName: saved.name,
    }
    const readAgain = {
      ...readWith,
      id: '00000000-0000-4000-8000-0000000000cc',
    }
    api.importProfilesControllerList.mockResolvedValue(ok([saved]))
    api.importsControllerPreview
      .mockResolvedValueOnce(ok(readWith))
      .mockResolvedValueOnce(ok(readAgain))
    api.importProfilesControllerInspect.mockResolvedValue(ok(inspection))
    api.importProfilesControllerUpdate.mockResolvedValue(ok(saved))
    api.importsControllerRemove.mockResolvedValue(
      ok({
        id: readWith.id,
        result: 'discarded',
        removedTransactions: 0,
        restoredManual: 0,
      }),
    )
    const { user } = setup()
    await user.upload(await screen.findByLabelText('Fichier CSV'), csv())

    await user.click(
      await screen.findByRole('button', { name: 'Changer le format' }),
    )
    expect(await screen.findByText(/est lu avec le format/)).toBeInTheDocument()
    // Starts from the saved format: the label read from the wrong column.
    expect(screen.getByLabelText('Libellé')).toHaveValue('Catégorie')
    await user.selectOptions(screen.getByLabelText('Libellé'), 'Libellé')
    await user.click(
      screen.getByRole('button', { name: 'Enregistrer et relire' }),
    )

    expect(
      await screen.findByRole('region', { name: 'Opérations du fichier' }),
    ).toBeInTheDocument()
    expect(api.importProfilesControllerUpdate).toHaveBeenCalledWith({
      path: { id: saved.id },
      body: expect.objectContaining({
        name: 'Banque fictive',
        columns: expect.objectContaining({ label: 'Libellé' }),
      }),
      throwOnError: false,
    })
    expect(api.importProfilesControllerCreate).not.toHaveBeenCalled()
    expect(api.importsControllerPreview).toHaveBeenLastCalledWith({
      body: {
        file: expect.any(File),
        accountId: account.id,
        profileId: saved.id,
      },
      throwOnError: false,
    })
    // The first reading is dropped: nothing was written by it.
    await waitFor(() =>
      expect(api.importsControllerRemove).toHaveBeenCalledWith({
        path: { id: readWith.id },
        throwOnError: false,
      }),
    )
  })

  it('lists the saved formats and deletes one after confirmation', async () => {
    api.importProfilesControllerList.mockResolvedValue(
      ok([{ ...profile, lastUsedAt: '2026-11-02T09:00:00.000Z' }]),
    )
    api.importProfilesControllerRemove.mockResolvedValue(ok(undefined))
    const { user } = setup()

    const formats = await screen.findByRole('region', {
      name: 'Formats enregistrés',
    })
    expect(within(formats).getByText('Banque fictive')).toBeInTheDocument()
    await user.click(
      within(formats).getByRole('button', {
        name: 'Supprimer le format Banque fictive',
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }))
    await waitFor(() =>
      expect(api.importProfilesControllerRemove).toHaveBeenCalledWith({
        path: { id: 'profile-1' },
        throwOnError: false,
      }),
    )
  })
})

describe('ImportPage — preview', () => {
  it('shows the summary, continuity, and every line of the file in order', async () => {
    const { user } = setup()
    const rows = await uploadPreview(user)

    const summary = screen.getByRole('region', { name: 'Résumé' })
    expect(
      within(summary)
        .getAllByRole('listitem')
        .map((tile) => tile.textContent),
    ).toEqual([
      '1À corrigerillisibles',
      '1À confirmerdoublons',
      '2Nouvellesà importer',
      '1Déjà làignorées',
    ])
    expect(summary).toHaveTextContent('du 02/03/2026 au 05/03/2026')

    expect(
      screen.getByText('Des opérations semblent manquer'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Entre le 03\/03\/2026 et le 04\/03\/2026 \(ligne 4\)/),
    ).toBeInTheDocument()
    expect(screen.queryByText('Fichier déjà importé')).not.toBeInTheDocument()

    // What needs action first, in numbered steps; the line already
    // imported is folded.
    expect(
      within(rows)
        .getAllByRole('heading')
        .map((heading) => heading.textContent),
    ).toEqual([
      '1Corriger 1 ligne illisible',
      '2Confirmer 1 doublon probable',
      '3Vérifier 2 nouvelles opérations',
    ])
    expect(
      within(rows)
        .getAllByTestId(/^line-/)
        .map((el) => el.dataset.testid),
    ).toEqual(['line-7', 'line-4', 'line-2', 'line-3'])
    expect(
      within(lineEl(7)).getByText('Date invalide ou manquante'),
    ).toBeInTheDocument()
    // The raw cells, the one the error blames in red, empty ones left out.
    const cells = within(lineEl(7)).getByRole('list', {
      name: 'Contenu de la ligne 7',
    })
    expect(
      within(cells)
        .getAllByRole('listitem')
        .map((cell) => [cell.textContent, cell.dataset.bad ?? null]),
    ).toEqual([
      ['Date32/03/2026', 'true'],
      ['Débit-8,00', null],
      ['LibelléCB FAKE KIOSK', null],
    ])
    // Its form is open from the start.
    expect(
      within(lineEl(7)).getByRole('form', { name: 'Corriger la ligne 7' }),
    ).toBeInTheDocument()
    expect(within(rows).queryByText('CB FAKE GARAGE')).not.toBeInTheDocument()

    const folded = within(rows).getByRole('button', {
      name: '1 ligne déjà dans vos opérations',
    })
    expect(folded).toHaveAttribute('aria-expanded', 'false')
    await user.click(folded)
    expect(folded).toHaveAttribute('aria-expanded', 'true')
    expect(within(lineEl(5)).getByText('CB FAKE GARAGE')).toBeInTheDocument()
  })

  it('shows the stored transaction a line already imported matches, with a link', async () => {
    const { user } = setup()
    const rows = await uploadPreview(user)
    await user.click(
      within(rows).getByRole('button', {
        name: '1 ligne déjà dans vos opérations',
      }),
    )
    expect(lineEl(5)).toHaveTextContent(
      'Déjà enregistrée le 02/03/2026 : « CB FAKE GARAGE »',
    )
    const link = within(lineEl(5)).getByRole('link', {
      name: 'Voir l’opération',
    })
    const href = new URL(link.getAttribute('href')!, 'http://app.test')
    expect(href.pathname).toBe('/transactions')
    expect(Object.fromEntries(href.searchParams)).toEqual({
      month: '2026-03',
      account: account.id,
      q: 'CB FAKE GARAGE',
    })
  })

  it('types an unreadable line in place and shows it checked again', async () => {
    const typed = {
      ...pendingDetail.preview!.rows[0],
      index: 4,
      lineNumber: 7,
      bookingDate: '2026-03-31',
      amountCents: -800,
      rawLabel: 'CB FAKE KIOSK',
      merchant: null,
      fixedFrom: pendingDetail.preview!.issues[0],
    }
    api.importsControllerFixLine.mockResolvedValue(
      ok({
        ...pendingDetail,
        counts: { ...pendingDetail.counts, rows: 5, new: 3, issues: 0 },
        preview: {
          ...pendingDetail.preview!,
          issues: [],
          rows: [...pendingDetail.preview!.rows, typed],
        },
      }),
    )
    const { user } = setup()
    await uploadPreview(user)
    expect(
      screen.getByText('1 ligne illisible restera de côté.'),
    ).toBeInTheDocument()

    const form = screen.getByRole('form', { name: 'Corriger la ligne 7' })
    // Starts from what the file held: the amount and the label.
    expect(within(form).getByLabelText('Libellé')).toHaveValue('CB FAKE KIOSK')
    expect(within(form).getByLabelText('Montant')).toHaveValue('8')
    await user.click(within(form).getByRole('button', { name: 'Vérifier' }))
    expect(within(form).getByText('Indiquez la date.')).toBeInTheDocument()
    expect(api.importsControllerFixLine).not.toHaveBeenCalled()

    await user.type(within(form).getByLabelText('Date'), '2026-03-31')
    await user.click(within(form).getByRole('button', { name: 'Vérifier' }))
    await waitFor(() =>
      expect(api.importsControllerFixLine).toHaveBeenCalledWith({
        path: { id: pendingDetail.id, lineNumber: 7 },
        body: {
          bookingDate: '2026-03-31',
          valueDate: null,
          amountCents: -800,
          balanceAfterCents: null,
          rawLabel: 'CB FAKE KIOSK',
        },
        throwOnError: false,
      }),
    )
    // Now a new transaction, in step 3.
    expect(await within(lineEl(7)).findByText('Corrigée')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: /^Vérifier/ })).getByTestId(
        'line-7',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: /Corriger/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('3 opérations seront importées.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/restera de côté/)).not.toBeInTheDocument()
    // Nothing is written before « Valider ».
    expect(api.importsControllerCommit).not.toHaveBeenCalled()

    // Put back as unreadable.
    api.importsControllerUnfixLine.mockResolvedValue(ok(pendingDetail))
    await user.click(
      within(lineEl(7)).getByRole('button', { name: 'Ne pas importer' }),
    )
    expect(
      await screen.findByRole('form', { name: 'Corriger la ligne 7' }),
    ).toBeInTheDocument()
    expect(api.importsControllerUnfixLine).toHaveBeenCalledWith({
      path: { id: pendingDetail.id, lineNumber: 7 },
      throwOnError: false,
    })
  })

  it('shows the stored transaction next to a conflict, skipped by default', async () => {
    const { user } = setup()
    const rows = await uploadPreview(user)

    expect(within(rows).getByText('FAKE CINEMA SHEET')).toBeInTheDocument()
    expect(
      within(rows).getByText(/Même montant, 1 jour d’écart/),
    ).toBeInTheDocument()
    const decision = within(rows).getByRole('group', {
      name: /Décision pour/,
    })
    expect(
      within(decision).getByRole('button', { name: 'C’est la même' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(decision).getByRole('button', {
        name: 'Ce sont deux opérations',
      }),
    ).toHaveAttribute('aria-pressed', 'false')
    // A skipped row has no category to pick.
    expect(
      screen.queryByLabelText('Catégorie de « CB FAKE CINEMA »'),
    ).not.toBeInTheDocument()
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
    await chooseCategory(
      user,
      categoryField('Catégorie de « CB FAKE BAKERY »'),
      'Loisirs',
    )
    await user.click(
      screen.getByRole('button', { name: 'Ce sont deux opérations' }),
    )
    await chooseCategory(
      user,
      categoryField('Catégorie de « CB FAKE CINEMA »'),
      'Loisirs',
    )
    expect(
      screen.getByText('3 opérations seront importées.'),
    ).toBeInTheDocument()

    const historyCalls = api.importsControllerList.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Valider l’import' }))

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
      ok({
        id: pendingDetail.id,
        result: 'discarded',
        removedTransactions: 0,
        restoredManual: 0,
      }),
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
})

describe('ImportPage — history', () => {
  it('undoes a committed import after confirmation', async () => {
    api.importsControllerList.mockResolvedValue(ok([committedSummary]))
    api.importsControllerFindOne.mockResolvedValue(ok(committedDetail))
    api.importsControllerRemove.mockResolvedValue(
      ok({
        id: committedSummary.id,
        result: 'undone',
        removedTransactions: 12,
        restoredManual: 0,
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
      '12 opérations ajoutées par « old-export.csv » sur Compte test seront supprimées. Cette action est irréversible.',
    )
    expect(api.importsControllerFindOne).toHaveBeenCalledWith({
      path: { id: committedSummary.id },
      throwOnError: false,
    })
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

  it('says what undoing loses and puts back before deleting', async () => {
    api.importsControllerList.mockResolvedValue(ok([committedSummary]))
    api.importsControllerFindOne.mockResolvedValue(
      ok({
        ...committedDetail,
        undo: { editedCount: 4, absorbedManualCount: 2 },
      }),
    )
    api.importsControllerRemove.mockResolvedValue(
      ok({
        id: committedSummary.id,
        result: 'undone',
        removedTransactions: 12,
        restoredManual: 2,
      }),
    )
    const { user } = setup()
    const item = await screen.findByRole('listitem', {
      name: 'Import old-export.csv',
    })
    await user.click(
      within(item).getByRole('button', { name: 'Annuler l’import' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(
      'dont 4 modifiées à la main et 2 rapprochées de vos saisies : ces 2 saisies seront remises comme saisies manuelles. Réimporter le fichier ne rendra pas les modifications.',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Annuler l’import' }),
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Import annulé : 12 opérations supprimées, 2 saisies remises',
      ),
    )
  })

  it('keeps the import when the dialog is dismissed', async () => {
    api.importsControllerList.mockResolvedValue(ok([committedSummary]))
    api.importsControllerFindOne.mockResolvedValue(ok(committedDetail))
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
