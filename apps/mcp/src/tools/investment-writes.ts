/**
 * Investment write tools (#104): statement values and crypto quantities that
 * Claude extracted from the owner's documents. Same contract as the #77 write
 * tools (`write.ts`): a preview without `confirm: true`, and with it only what
 * still differs is written, so running an import twice changes nothing the
 * second time. Only extracted values reach the API: cents and exact decimal
 * strings, never floats, never the documents themselves.
 */
import { z } from 'zod'
import type {
  AccountDto,
  AccountHoldingsDto,
  BulkSnapshotRowDto,
  BulkSnapshotsResultDto,
  CryptoAssetDto,
  HoldingDto,
  InvestedBaseDto,
  InvestedBasePreviewDto,
  InvestedFiguresDto,
  SaveHoldingDto,
  SetInvestedBaseDto,
  SnapshotDto,
  ValuedHoldingDto,
} from '../api/types.js'
import { ApiError } from '../api/client.js'
import {
  centsToText,
  euros,
  eurosOrUnknown,
  frenchDate,
  parisToday,
  parseEuros,
  percent,
  signedEuros,
} from '../format.js'
import {
  canonicalQuantity,
  frenchQuantity,
  parseQuantity,
} from '../quantity.js'
import { ACCOUNT_TYPE_LABELS } from './labels.js'
import { DATE_PATTERN, listAccounts, normalize } from './lookup.js'
import {
  findSameName,
  INVESTMENT_TYPE_DESCRIPTION,
  INVESTMENT_TYPES,
  resolveInvestmentAccount,
  typeHint,
} from './investments.js'
import { defineTool, ToolInputError } from './tool.js'
import { confirmSchema, PREVIEW_FOOTER, PREVIEW_HEADER } from './write.js'

/** Rows of one call: ten years of monthly statements and then some. */
const MAX_SNAPSHOTS = 200
const MAX_HOLDINGS = 50
const LOCATION_MAX = 100

// ---------------------------------------------------------------------------
// add_investment_snapshots
// ---------------------------------------------------------------------------

interface PlannedSnapshot {
  date: string
  valueCents: number
  /** `undefined`: not given, the day keeps the contributions it has. */
  contributionsCents: number | undefined
  current: SnapshotDto | undefined
}

function parseCents(
  text: string,
  what: string,
  date: string,
  allowNegative: boolean,
): number {
  const parsed = parseEuros(text)
  if (!parsed || (!allowNegative && parsed.sign === '-')) {
    throw new ToolInputError(
      `${what} « ${text} » invalide au ${frenchDate(date)} : un montant en euros${allowNegative ? '' : ' positif'} (ex. 12 345,67). Rien n'a été modifié.`,
    )
  }
  return parsed.sign === '-' ? -parsed.cents : parsed.cents
}

function isChange(p: PlannedSnapshot): boolean {
  if (!p.current) return true
  if (p.current.valueCents !== p.valueCents) return true
  return (
    p.contributionsCents !== undefined &&
    p.contributionsCents !== p.current.contributionsCents
  )
}

function snapshotLine(p: PlannedSnapshot): string {
  const contributions =
    p.contributionsCents === undefined
      ? ''
      : ` (investi ${euros(p.contributionsCents)})`
  if (!p.current) {
    return `- ${frenchDate(p.date)} : nouvelle valeur ${euros(p.valueCents)}${contributions}`
  }
  const contributionsChange =
    p.contributionsCents !== undefined &&
    p.contributionsCents !== p.current.contributionsCents
      ? `, investi ${eurosOrUnknown(p.current.contributionsCents)} → ${euros(p.contributionsCents)}`
      : ''
  const value =
    p.current.valueCents === p.valueCents
      ? `valeur inchangée ${euros(p.valueCents)}`
      : `${euros(p.current.valueCents)} → ${euros(p.valueCents)}`
  return `- ${frenchDate(p.date)} : ${value}${contributionsChange}`
}

/** Latest snapshot once `rows` are written (they win on their day). */
function latestAfter(
  existing: SnapshotDto[],
  rows: PlannedSnapshot[],
): { date: string; valueCents: number } | undefined {
  const byDate = new Map<string, number>(
    existing.map((s) => [s.date, s.valueCents]),
  )
  for (const row of rows) byDate.set(row.date, row.valueCents)
  const latest = [...byDate.keys()].sort().at(-1)
  return latest === undefined
    ? undefined
    : { date: latest, valueCents: byDate.get(latest) ?? 0 }
}

function netWorthEffect(
  account: AccountDto,
  existing: SnapshotDto[],
  changes: PlannedSnapshot[],
): string {
  const before = existing.at(-1)
  const after = latestAfter(existing, changes)
  if (!after) return ''
  const from = before
    ? `${euros(before.valueCents)} au ${frenchDate(before.date)}`
    : 'aucune valeur'
  const delta = after.valueCents - (before?.valueCents ?? 0)
  if (before && before.date === after.date && delta === 0) {
    return `Valeur actuelle de ${account.name} inchangée (${from}) : seules des dates passées changent, comme l'historique du patrimoine.`
  }
  return `Valeur actuelle de ${account.name} : ${from} → ${euros(after.valueCents)} au ${frenchDate(after.date)}, soit ${signedEuros(delta)} sur le patrimoine net.`
}

export const addInvestmentSnapshotsTool = defineTool({
  name: 'add_investment_snapshots',
  title: 'Ajouter des valeurs de placement',
  description:
    "Record dated values of an investment account (PEA, compte-titres, life insurance, employee savings) read from statements, one per day (upserted). A day's value is the account value at the end of that day: the statement's valuation date. Never after today. Not for crypto accounts (sync_crypto_holdings). Method: Capi skill, « placements ».",
  write: { idempotent: true },
  inputSchema: {
    account: z
      .string()
      .max(100)
      .describe('Investment account name (see list_investment_accounts).'),
    snapshots: z
      .array(
        z.object({
          date: z
            .string()
            .regex(DATE_PATTERN)
            .describe('Day the value belongs to, YYYY-MM-DD.'),
          value: z
            .string()
            .max(20)
            .describe(
              'Account value that day in euros as text, e.g. "12 345,67". Copy the digits from the document; never compute or round them.',
            ),
          contributions: z
            .string()
            .max(20)
            .optional()
            .describe(
              'Net contributions to date (deposits minus withdrawals) in euros, when the statement gives them. Left out: the day keeps the contributions it has.',
            ),
        }),
      )
      .min(1)
      .max(MAX_SNAPSHOTS)
      .describe(`1 to ${MAX_SNAPSHOTS} days, each at most once.`),
    confirm: confirmSchema,
  },
  async run({ api, now }, args) {
    const account = await resolveInvestmentAccount(api, args.account)
    // A crypto account's values are computed by the app every day (#366).
    if (account.type === 'crypto') {
      throw new ToolInputError(
        `${account.name} est un compte crypto : sa valeur est calculée chaque jour à partir de ses avoirs et des cours, jamais saisie. Pour un compte en saisie manuelle, mettez ses quantités à jour avec sync_crypto_holdings. Rien n'a été modifié.`,
      )
    }
    const today = parisToday(now())
    const seen = new Set<string>()
    for (const row of args.snapshots) {
      if (seen.has(row.date)) {
        throw new ToolInputError(
          `Le ${frenchDate(row.date)} apparaît deux fois : une seule valeur par jour. Rien n'a été modifié.`,
        )
      }
      seen.add(row.date)
      if (row.date > today) {
        throw new ToolInputError(
          `Le ${frenchDate(row.date)} est dans le futur : une valeur ne peut pas être datée après aujourd'hui (${frenchDate(today)}). Rien n'a été modifié.`,
        )
      }
    }
    const existing = await api.get<SnapshotDto[]>(
      `/api/accounts/${account.id}/snapshots`,
    )
    const byDate = new Map(existing.map((s) => [s.date, s]))
    const planned: PlannedSnapshot[] = args.snapshots
      .map((row) => ({
        date: row.date,
        valueCents: parseCents(row.value, 'Valeur', row.date, false),
        contributionsCents:
          row.contributions === undefined
            ? undefined
            : parseCents(row.contributions, 'Investi', row.date, true),
        current: byDate.get(row.date),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const changes = planned.filter(isChange)
    const created = changes.filter((p) => !p.current)
    const updated = changes.filter((p) => p.current)
    const unchangedCount = planned.length - changes.length
    const header = `${account.name} (${ACCOUNT_TYPE_LABELS[account.type]}${account.institution ? `, ${account.institution}` : ''})`
    const unchangedLine =
      unchangedCount > 0
        ? [
            `Déjà enregistrés à l'identique, rien à faire : ${unchangedCount} jour(s).`,
          ]
        : []
    if (changes.length === 0) {
      return `Rien à modifier : ${header} a déjà ces ${planned.length} valeur(s).`
    }
    const details = [
      ...(created.length > 0
        ? [
            `Nouvelles valeurs (${created.length}) :`,
            ...created.map(snapshotLine),
          ]
        : []),
      ...(updated.length > 0
        ? [
            `Valeurs remplacées (${updated.length}) :`,
            ...updated.map(snapshotLine),
          ]
        : []),
      ...unchangedLine,
    ]
    if (args.confirm !== true) {
      return [
        PREVIEW_HEADER,
        header,
        ...details,
        netWorthEffect(account, existing, changes),
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }

    const result = await api.send<BulkSnapshotsResultDto>(
      'POST',
      `/api/accounts/${account.id}/snapshots/bulk`,
      {
        rows: changes.map(
          (p): BulkSnapshotRowDto => ({
            date: p.date,
            valueCents: p.valueCents,
            ...(p.contributionsCents === undefined
              ? {}
              : { contributionsCents: p.contributionsCents }),
          }),
        ),
      },
    )
    const undo = updated.map((p) => ({
      date: p.date,
      value: centsToText(p.current?.valueCents ?? 0),
      ...(p.current?.contributionsCents === null ||
      p.current?.contributionsCents === undefined
        ? {}
        : { contributions: centsToText(p.current.contributionsCents) }),
    }))
    return [
      `${header} : ${result.created} valeur(s) ajoutée(s), ${result.updated} remplacée(s).`,
      ...details,
      netWorthEffect(account, existing, changes),
      '',
      ...(undo.length > 0
        ? [
            `Pour revenir aux valeurs remplacées : add_investment_snapshots account "${account.name}", snapshots ${JSON.stringify(undo)}, confirm: true.`,
          ]
        : []),
      ...(created.length > 0
        ? [
            "Les jours ajoutés se suppriment dans l'application (fiche du compte, historique des valeurs) ; aucun outil MCP ne supprime.",
          ]
        : []),
    ].join('\n')
  },
})

// ---------------------------------------------------------------------------
// sync_crypto_holdings
// ---------------------------------------------------------------------------

interface RequestedHolding {
  input: string
  asset: Pick<CryptoAssetDto, 'id' | 'symbol' | 'name'>
  quantity: string
  /** `undefined`: not given (kept on an existing line, unknown on a new one). */
  investedCents: number | undefined
}

type Planned =
  | { action: 'add'; wanted: RequestedHolding }
  | { action: 'change'; wanted: RequestedHolding; current: ValuedHoldingDto }
  | { action: 'unchanged'; wanted: RequestedHolding; current: ValuedHoldingDto }
  | { action: 'zero'; current: ValuedHoldingDto }

const ORIGIN_LABELS = {
  import: 'importée',
  sync: 'synchronisée',
  manual: 'saisie',
} as const

function locationLabel(location: string): string {
  return location ? `« ${location} »` : 'sans emplacement'
}

/**
 * The asset `input` names: an asset the account already holds (id or ticker),
 * else the price provider's search (only the text is sent): exact id, or the
 * only ranked asset with that ticker.
 */
async function resolveAsset(
  api: AccountHoldingsApi,
  held: ValuedHoldingDto[],
  input: string,
): Promise<RequestedHolding['asset']> {
  const wanted = input.trim().toLowerCase()
  const known = held.find(
    (h) => h.assetId === wanted || h.symbol.toLowerCase() === wanted,
  )
  if (known) {
    return { id: known.assetId, symbol: known.symbol, name: known.name }
  }
  const found = await api.searchAssets(input.trim())
  const byId = found.find((a) => a.id === wanted)
  if (byId) return byId
  const sameTicker = found.filter((a) => a.symbol.toLowerCase() === wanted)
  const ranked = sameTicker.filter((a) => a.rank !== null)
  const only =
    ranked.length === 1
      ? ranked[0]
      : sameTicker.length === 1
        ? sameTicker[0]
        : undefined
  if (only) return only
  const candidates = (sameTicker.length > 0 ? sameTicker : found)
    .slice(0, 8)
    .map((a) => `${a.name} (${a.symbol}, id ${a.id})`)
    .join(', ')
  throw new ToolInputError(
    candidates
      ? `Actif « ${input} » ambigu ou inconnu. Passez l'id exact parmi : ${candidates}. Rien n'a été modifié.`
      : `Actif « ${input} » introuvable : passez son id CoinGecko (ex. bitcoin). Rien n'a été modifié.`,
  )
}

interface AccountHoldingsApi {
  searchAssets(q: string): Promise<CryptoAssetDto[]>
}

function holdingBody(
  current: Pick<HoldingDto, 'assetId' | 'symbol' | 'name' | 'location'> & {
    note?: string | null
  },
  quantity: string,
  investedCents: number | null,
): SaveHoldingDto {
  return {
    assetId: current.assetId,
    symbol: current.symbol,
    name: current.name,
    quantity,
    location: current.location,
    investedCents,
    note: current.note ?? null,
  }
}

function investedText(cents: number | null | undefined): string {
  return cents === null || cents === undefined
    ? 'investi inconnu'
    : `investi ${euros(cents)}`
}

function plannedLine(p: Planned): string {
  switch (p.action) {
    case 'add':
      return `- ${p.wanted.asset.symbol} (${p.wanted.asset.name}) : ${frenchQuantity(p.wanted.quantity)}, ${investedText(p.wanted.investedCents)}`
    case 'change': {
      const parts: string[] = []
      if (canonicalQuantity(p.current.quantity) !== p.wanted.quantity) {
        parts.push(
          `${frenchQuantity(p.current.quantity)} → ${frenchQuantity(p.wanted.quantity)}`,
        )
      } else {
        parts.push(`quantité inchangée ${frenchQuantity(p.wanted.quantity)}`)
      }
      if (
        p.wanted.investedCents !== undefined &&
        p.wanted.investedCents !== p.current.investedCents
      ) {
        parts.push(
          `${investedText(p.current.investedCents)} → ${euros(p.wanted.investedCents)}`,
        )
      }
      return `- ${p.current.symbol} : ${parts.join(', ')}`
    }
    case 'unchanged':
      return `- ${p.current.symbol} : ${frenchQuantity(p.current.quantity)}`
    case 'zero':
      return `- ${p.current.symbol} : ${frenchQuantity(p.current.quantity)} → 0 (absent de l'export : la ligne reste, à 0, jusqu'à ce que le propriétaire la supprime dans l'application)`
  }
}

export const syncCryptoHoldingsTool = defineTool({
  name: 'sync_crypto_holdings',
  title: 'Mettre à jour des avoirs crypto',
  description:
    "Set the quantities held at one location (wallet or exchange label) of a crypto account with the manual source, from an export or statement. The list becomes that location's hand-entered lines; imported or synced lines are never touched. Hand-entered lines left out go to quantity 0 (deleted in the app). Quantities are exact decimal strings, never rounded. Method: Capi skill, « placements ».",
  write: { idempotent: true },
  inputSchema: {
    account: z
      .string()
      .max(100)
      .describe('Investment account name (see list_investment_accounts).'),
    location: z
      .string()
      .max(LOCATION_MAX)
      .describe(
        'Wallet or exchange label the export covers, e.g. "Ledger" (same spelling every time); "" for an account held in a single place.',
      ),
    holdings: z
      .array(
        z.object({
          asset: z
            .string()
            .min(1)
            .max(100)
            .describe(
              'Ticker (e.g. "BTC") or CoinGecko id (e.g. "bitcoin"). Use the id when a ticker is ambiguous.',
            ),
          quantity: z
            .string()
            .max(60)
            .describe(
              'Quantity held, copied digit for digit from the export as text, e.g. "0.01234567" (up to 18 decimals). Greater than 0: leave sold-out assets out.',
            ),
          invested: z
            .string()
            .max(20)
            .optional()
            .describe(
              'Total euros invested in this holding, when the document gives it. Left out: an existing line keeps its amount, a new one has none.',
            ),
        }),
      )
      .max(MAX_HOLDINGS)
      .describe(
        `0 to ${MAX_HOLDINGS} assets: everything held at this location now. An empty list sets every hand-entered line of the location to 0.`,
      ),
    confirm: confirmSchema,
  },
  async run({ api }, args) {
    const account = await resolveInvestmentAccount(api, args.account)
    if (account.type !== 'crypto') {
      throw new ToolInputError(
        `${account.name} n'est pas un compte crypto : utilisez add_investment_snapshots pour ses valeurs. Rien n'a été modifié.`,
      )
    }
    if (account.cryptoSource !== 'manual') {
      throw new ToolInputError(
        account.cryptoSource === 'exchange'
          ? `${account.name} est un compte de plateforme : ses avoirs viennent de l'import de ses exports dans l'application (compte → Importer), pas de cet outil. Rien n'a été modifié.`
          : `${account.name} est un portefeuille synchronisé : ses avoirs viennent de ses clés publiques (« Synchroniser » dans l'application), pas de cet outil. Rien n'a été modifié.`,
      )
    }
    const path = `/api/accounts/${account.id}/holdings`
    const before = await api.get<AccountHoldingsDto>(path)
    const searchApi: AccountHoldingsApi = {
      searchAssets: (q) =>
        api.get<CryptoAssetDto[]>('/api/crypto/assets', { q }),
    }

    const atLocation = before.holdings.filter(
      (h) => normalize(h.location) === normalize(args.location),
    )
    // Keep the spelling already used at that location, so new lines join it.
    const location = atLocation[0]?.location ?? args.location.trim()
    const requested: RequestedHolding[] = []
    for (const row of args.holdings) {
      const quantity = parseQuantity(row.quantity)
      if (quantity === null) {
        throw new ToolInputError(
          `Quantité « ${row.quantity} » invalide pour ${row.asset} : un nombre décimal positif, sans signe ni exposant, 18 décimales au plus (ex. 0.01234567). Rien n'a été modifié.`,
        )
      }
      if (quantity === '0') {
        throw new ToolInputError(
          `Quantité nulle pour ${row.asset} : laissez cet actif hors de la liste (les lignes absentes passent à 0). Rien n'a été modifié.`,
        )
      }
      let investedCents: number | undefined
      if (row.invested !== undefined) {
        const parsed = parseEuros(row.invested)
        if (!parsed || parsed.sign === '-') {
          throw new ToolInputError(
            `Montant investi « ${row.invested} » invalide pour ${row.asset} : un montant positif en euros. Rien n'a été modifié.`,
          )
        }
        investedCents = parsed.cents
      }
      const asset = await resolveAsset(searchApi, before.holdings, row.asset)
      if (requested.some((r) => r.asset.id === asset.id)) {
        throw new ToolInputError(
          `${asset.symbol} apparaît deux fois : une ligne par actif et par emplacement. Rien n'a été modifié.`,
        )
      }
      const derived = atLocation.find(
        (h) => h.assetId === asset.id && h.origin !== 'manual',
      )
      if (derived) {
        throw new ToolInputError(
          `${asset.symbol} ${locationLabel(location)} vient d'une ligne ${ORIGIN_LABELS[derived.origin]} (export de plateforme ou synchronisation) : elle ne se modifie pas à la main. Retirez-le de la liste, ou utilisez un autre emplacement. Rien n'a été modifié.`,
        )
      }
      requested.push({ input: row.asset, asset, quantity, investedCents })
    }

    const manual = atLocation.filter((h) => h.origin === 'manual')
    const planned: Planned[] = requested.map((wanted) => {
      const current = manual.find((h) => h.assetId === wanted.asset.id)
      if (!current) return { action: 'add', wanted }
      const differs =
        canonicalQuantity(current.quantity) !== wanted.quantity ||
        (wanted.investedCents !== undefined &&
          wanted.investedCents !== current.investedCents)
      return differs
        ? { action: 'change', wanted, current }
        : { action: 'unchanged', wanted, current }
    })
    for (const current of manual) {
      if (requested.some((r) => r.asset.id === current.assetId)) continue
      planned.push(
        canonicalQuantity(current.quantity) === '0'
          ? {
              action: 'unchanged',
              current,
              wanted: {
                input: current.symbol,
                asset: {
                  id: current.assetId,
                  symbol: current.symbol,
                  name: current.name,
                },
                quantity: '0',
                investedCents: undefined,
              },
            }
          : { action: 'zero', current },
      )
    }

    const of = (action: Planned['action']) =>
      planned.filter((p) => p.action === action)
    const changes = planned.filter((p) => p.action !== 'unchanged')
    const derivedLines = atLocation.filter((h) => h.origin !== 'manual')
    const header = `${account.name}, emplacement ${locationLabel(location)}`
    const section = (title: string, items: Planned[]) =>
      items.length > 0
        ? [`${title} (${items.length}) :`, ...items.map(plannedLine)]
        : []
    const details = [
      ...section('Ajoutés', of('add')),
      ...section('Modifiés', of('change')),
      ...section('Mis à 0', of('zero')),
      ...section('Inchangés', of('unchanged')),
      ...(derivedLines.length > 0
        ? [
            `Lignes importées ou synchronisées à cet emplacement, jamais modifiées par cet outil : ${derivedLines.map((h) => h.symbol).join(', ')}.`,
          ]
        : []),
    ]
    if (changes.length === 0) {
      return [
        `Rien à modifier : ${header} correspond déjà à cette liste.`,
        ...details,
      ].join('\n')
    }
    if (args.confirm !== true) {
      return [
        PREVIEW_HEADER,
        header,
        ...details,
        `Valeur actuelle du compte : ${euros(before.totals.valueCents)}${before.complete ? '' : ' (incomplète : des actifs sans prix)'} ; elle est recalculée aux prix connus après l'enregistrement.`,
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }

    const applied: Planned[] = []
    try {
      for (const p of changes) {
        if (p.action === 'add') {
          await api.send<HoldingDto>(
            'POST',
            path,
            holdingBody(
              {
                assetId: p.wanted.asset.id,
                symbol: p.wanted.asset.symbol,
                name: p.wanted.asset.name,
                location,
              },
              p.wanted.quantity,
              p.wanted.investedCents ?? null,
            ),
          )
        } else if (p.action === 'change') {
          await api.send<HoldingDto>(
            'PUT',
            `${path}/${p.current.id}`,
            holdingBody(
              p.current,
              p.wanted.quantity,
              p.wanted.investedCents ?? p.current.investedCents,
            ),
          )
        } else if (p.action === 'zero') {
          // Sold out or moved: worth nothing now, and nothing invested left in it.
          await api.send<HoldingDto>(
            'PUT',
            `${path}/${p.current.id}`,
            holdingBody(p.current, '0', 0),
          )
        }
        applied.push(p)
      }
    } catch (error) {
      if (!(error instanceof ApiError) || applied.length === 0) throw error
      return [
        `Erreur après ${applied.length} ligne(s) sur ${changes.length} : ${error.message}`,
        'Appliquées :',
        ...applied.map(plannedLine),
        "Rappelez l'outil avec les mêmes arguments : ce qui est déjà en place est sauté.",
      ].join('\n')
    }

    const after = await api.get<AccountHoldingsDto>(path)
    const undo = manual
      .filter((h) => canonicalQuantity(h.quantity) !== '0')
      .map((h) => ({
        asset: h.assetId,
        quantity: canonicalQuantity(h.quantity),
        ...(h.investedCents === null
          ? {}
          : { invested: centsToText(h.investedCents) }),
      }))
    const added = of('add')
    const zeroed = applied.filter((p) => p.action === 'zero')
    return [
      `${header} : ${applied.length} ligne(s) mise(s) à jour.`,
      ...details,
      ...(zeroed.length > 0
        ? [
            `À supprimer dans l'application (compte ${account.name}, avoirs) si ces actifs ne reviendront pas : ${zeroed.map((p) => (p.action === 'zero' ? p.current.symbol : '')).join(', ')}, maintenant à 0. Aucun outil MCP ne supprime.`,
          ]
        : []),
      `Valeur du compte : ${euros(before.totals.valueCents)} → ${euros(after.totals.valueCents)}${after.complete ? '' : ' (incomplète : des actifs sans prix ; fixez leur prix dans l’application)'}.`,
      '',
      `Pour revenir à l'état précédent : sync_crypto_holdings account "${account.name}", location ${JSON.stringify(location)}, holdings ${JSON.stringify(undo)}, confirm: true${added.length > 0 ? ' (les lignes ajoutées passeront à 0 ; supprimez-les dans l’application si besoin)' : ''}.`,
    ].join('\n')
  },
})

// ---------------------------------------------------------------------------
// set_invested_amount
// ---------------------------------------------------------------------------

/** « investi 5 000,00 €, résultat -2 000,00 € (-40 %) ». */
function investedFiguresText(figures: InvestedFiguresDto): string {
  if (figures.contributionsCents === null) return 'investi inconnu'
  const gain =
    figures.gainCents === null
      ? ''
      : `, résultat ${signedEuros(figures.gainCents)}${
          figures.returnRate === null ? '' : ` (${percent(figures.returnRate)})`
        }`
  return `investi ${euros(figures.contributionsCents)}${gain}`
}

/** « 5 000,00 € au 30/06/2026 », or « aucun ». */
function baseText(base: InvestedBaseDto | null): string {
  return base ? `${euros(base.amountCents)} au ${frenchDate(base.on)}` : 'aucun'
}

/** What else makes the invested amount: transfers linked, unknown amounts. */
function linkedNote(figures: InvestedFiguresDto): string[] {
  const lines: string[] = []
  if (figures.investedBase && figures.linkedTransfersCount > 0) {
    lines.push(
      `S'y ajoutent ${figures.linkedTransfersCount} virement(s) lié(s) depuis le ${frenchDate(figures.investedBase.on)}.`,
    )
  }
  if (figures.unknownCostCount > 0) {
    lines.push(
      `Dont ${figures.unknownCostCount} virement(s) de montant inconnu, non compté(s) dans l'investi.`,
    )
  }
  return lines
}

export const setInvestedAmountTool = defineTool({
  name: 'set_invested_amount',
  title: 'Montant investi d’un placement',
  description:
    'Set what the owner invested in a PEA, a compte-titres, a life insurance or employee savings up to a day (« Investi au … »), so its result and rate show; transfers linked to the account after that day add on top. Not for crypto accounts (cost of their coins, in the app). Removing it is done in the app.',
  write: { idempotent: true },
  inputSchema: {
    account: z
      .string()
      .max(100)
      .describe('Investment account name (see list_investment_accounts).'),
    amount: z
      .string()
      .max(20)
      .describe(
        'Total invested up to that day in euros as text, fees included, e.g. "5 000". Copy the owner\'s figure; never compute it.',
      ),
    until: z
      .string()
      .regex(DATE_PATTERN)
      .describe(
        "Day the amount was right, YYYY-MM-DD, not after today (a statement's date): transfers linked after it add on top.",
      ),
    confirm: confirmSchema,
  },
  async run({ api, now }, args) {
    const account = await resolveInvestmentAccount(api, args.account)
    // A crypto account's cost follows its coins (#373).
    if (account.type === 'crypto') {
      throw new ToolInputError(
        `${account.name} est un compte crypto : son montant investi est le coût de ses cryptos, suivi d'une plateforme au wallet et retour, sans rien saisir. Le prix de revient des cryptos venues d'ailleurs se donne dans l'application, page du compte › « À préciser ». Rien n'a été modifié.`,
      )
    }
    const parsed = parseEuros(args.amount)
    if (!parsed || parsed.sign === '-') {
      throw new ToolInputError(
        `Montant « ${args.amount} » invalide : un montant en euros positif (ex. 5 000). Rien n'a été modifié.`,
      )
    }
    const today = parisToday(now())
    if (args.until > today) {
      throw new ToolInputError(
        `Le ${frenchDate(args.until)} est dans le futur : la date ne peut pas être après aujourd'hui (${frenchDate(today)}). Rien n'a été modifié.`,
      )
    }
    const body: SetInvestedBaseDto = {
      amountCents: parsed.cents,
      on: args.until,
    }
    const preview = await api.send<InvestedBasePreviewDto>(
      'POST',
      `/api/accounts/${account.id}/invested-base/preview`,
      body,
    )
    const previous = preview.current.investedBase
    if (
      previous &&
      previous.amountCents === body.amountCents &&
      previous.on === body.on
    ) {
      return [
        `Rien à modifier : ${account.name} a déjà ${baseText(previous)} comme montant investi.`,
        `Aujourd'hui : ${investedFiguresText(preview.current)}.`,
        ...linkedNote(preview.current),
      ].join('\n')
    }
    const details = [
      `Montant investi de base : ${baseText(previous)} → ${baseText(preview.next.investedBase)}.`,
      `Avant : ${investedFiguresText(preview.current)}.`,
      `Après : ${investedFiguresText(preview.next)}.`,
      ...linkedNote(preview.next),
    ]
    if (args.confirm !== true) {
      return [
        PREVIEW_HEADER,
        account.name,
        ...details,
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }
    const saved = await api.send<InvestedFiguresDto>(
      'PUT',
      `/api/accounts/${account.id}/invested-base`,
      body,
    )
    return [
      `${account.name} : montant investi enregistré, ${investedFiguresText(saved)}.`,
      ...linkedNote(saved),
      '',
      previous
        ? `Pour revenir à l'ancien montant : set_invested_amount account "${account.name}", amount "${centsToText(previous.amountCents)}", until "${previous.on}", confirm: true.`
        : "Pour le retirer : dans l'application, page du compte › « Modifier » le montant investi › « Retirer » ; aucun outil MCP ne supprime.",
    ].join('\n')
  },
})

// ---------------------------------------------------------------------------
// create_investment_account
// ---------------------------------------------------------------------------

export const createInvestmentAccountTool = defineTool({
  name: 'create_investment_account',
  title: 'Préparer un compte de placement',
  description: `Check a new investment account before the owner creates it, for a vehicle found in the documents that has no account yet. Personal access tokens cannot create accounts (account changes stay in the app, signed in), so this tool writes nothing: it says whether an account with that name already exists (open or archived) and gives the exact fields to enter in the app (Comptes → Ajouter un compte). Call list_investment_accounts again once it is created. ${INVESTMENT_TYPE_DESCRIPTION}`,
  inputSchema: {
    name: z
      .string()
      .min(1)
      .max(100)
      .describe('Account name, e.g. "PEA Banque Test".'),
    type: z.enum(INVESTMENT_TYPES).describe(INVESTMENT_TYPE_DESCRIPTION),
    institution: z
      .string()
      .max(100)
      .optional()
      .describe('Bank, insurer or platform, e.g. "Assureur Test".'),
  },
  async run({ api }, args) {
    const name = args.name.trim()
    const accounts = await listAccounts(api)
    const same = findSameName(accounts, name)
    if (same) {
      const state = same.archivedAt
        ? "archivé : restaurez-le dans l'application (Comptes) plutôt que d'en créer un autre"
        : 'ouvert : utilisez-le'
      return `Un compte « ${same.name} » existe déjà (${ACCOUNT_TYPE_LABELS[same.type]}${same.institution ? `, ${same.institution}` : ''}), ${state}. Rien n'a été créé.`
    }
    const institution = args.institution?.trim()
    return [
      `Aucun compte « ${name} » : à créer dans l'application (les jetons d'accès ne créent pas de compte).`,
      "Dans l'application, Comptes → Ajouter un compte :",
      `- Nom : ${name}`,
      `- Type : ${typeHint(args.type)}`,
      ...(institution ? [`- Établissement : ${institution}`] : []),
      ...(args.type === 'crypto'
        ? [
            "- Pour un export Binance ou Coinbase, préférez une source « Plateforme » et l'import du fichier dans l'application ; pour un portefeuille, « Portefeuille » avec ses clés publiques. sync_crypto_holdings ne sert qu'aux comptes en « Saisie manuelle » (autres exports, relevés).",
          ]
        : []),
      '',
      "Demandez au propriétaire de le créer, puis relancez list_investment_accounts. Rien n'a été créé.",
    ].join('\n')
  },
})
