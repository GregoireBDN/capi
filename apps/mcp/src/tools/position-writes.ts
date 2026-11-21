/**
 * `sync_security_positions` (ADR 0006, #413): a PEA's lines read by Claude
 * from a broker's statement. Same contract as the #77 write tools: without
 * `confirm: true` the API previews the statement (nothing is written); with
 * it, the whole statement of that day is written and the account's values
 * are computed from it, so a repeated call changes nothing. Quantities and
 * prices travel as exact decimal strings, never floats.
 */
import { z } from 'zod'
import type {
  AccountDto,
  PositionsDto,
  PreviewLineDto,
  PutStatementDto,
  StatementPreviewDto,
} from '../api/types.js'
import {
  euros,
  eurosOrUnknown,
  frenchDate,
  parisToday,
  parseEuros,
} from '../format.js'
import { isValidIsin, normalizeIsin } from '../isin.js'
import { frenchQuantity, parseQuantity } from '../quantity.js'
import { DATE_PATTERN } from './lookup.js'
import { resolveInvestmentAccount } from './investments.js'
import { defineTool, ToolInputError } from './tool.js'
import { confirmSchema, PREVIEW_FOOTER, PREVIEW_HEADER } from './write.js'

const MAX_LINES = 100
const PRICE_DECIMALS = 12

/** A price or a PRU in euros as an exact decimal string, or null. */
export function parseEurPrice(text: string): string | null {
  const parsed = parseQuantity(text.replace(/€/g, ''))
  if (parsed === null) return null
  const decimals = parsed.split('.')[1]?.length ?? 0
  return decimals > PRICE_DECIMALS ? null : parsed
}

function frenchPrice(text: string): string {
  return `${frenchQuantity(text)} €`
}

function lineText(line: PreviewLineDto): string {
  const name = line.name ?? line.isin
  const price = line.priceEur
    ? `, cours ${frenchPrice(line.priceEur)}${line.priceKept ? ' (cours saisi à la main gardé)' : ''}`
    : ', sans cours'
  const pru = (cost: string | null) =>
    cost ? `PRU ${frenchPrice(cost)}` : 'PRU inconnu'
  switch (line.status) {
    case 'new':
      return `- ${name} (${line.isin}) : nouvelle ligne, ${frenchQuantity(line.quantityAfter!)} parts, ${pru(line.unitCostAfter)}${price}`
    case 'removed':
      return `- ${name} (${line.isin}) : absente du relevé, retirée (${frenchQuantity(line.quantityBefore!)} parts avant)`
    case 'changed': {
      const quantity =
        line.quantityBefore === line.quantityAfter
          ? `${frenchQuantity(line.quantityAfter!)} parts`
          : `${frenchQuantity(line.quantityBefore!)} → ${frenchQuantity(line.quantityAfter!)} parts`
      const cost =
        line.unitCostBefore === line.unitCostAfter
          ? pru(line.unitCostAfter)
          : `${pru(line.unitCostBefore)} → ${pru(line.unitCostAfter)}`
      return `- ${name} (${line.isin}) : ${quantity}, ${cost}${price}`
    }
    default:
      return `- ${name} (${line.isin}) : inchangée, ${frenchQuantity(line.quantityAfter!)} parts${price}`
  }
}

function previewText(
  account: AccountDto,
  preview: StatementPreviewDto,
): string[] {
  const compared = preview.comparedWith
    ? preview.comparedWith === preview.asOf
      ? `remplace le relevé déjà enregistré ce jour-là`
      : `comparé au relevé du ${frenchDate(preview.comparedWith)}`
    : 'premier relevé de lignes du compte'
  const cash =
    preview.cashBeforeCents === null
      ? `Liquidités : ${euros(preview.cashAfterCents)}`
      : preview.cashBeforeCents === preview.cashAfterCents
        ? `Liquidités inchangées : ${euros(preview.cashAfterCents)}`
        : `Liquidités : ${euros(preview.cashBeforeCents)} → ${euros(preview.cashAfterCents)}`
  const value =
    preview.typedValueCents !== null
      ? `Valeur du ${frenchDate(preview.asOf)} : ${euros(preview.typedValueCents)} saisie à la main, gardée (une valeur saisie l'emporte sur son jour) ; les lignes valent ${eurosOrUnknown(preview.valueAfterCents)}.`
      : preview.valueAfterCents === null
        ? `Valeur du ${frenchDate(preview.asOf)} : pas calculée, une ligne n'a pas de cours (donnez le cours du relevé).`
        : preview.valueBeforeCents === null
          ? `Valeur du ${frenchDate(preview.asOf)} : ${euros(preview.valueAfterCents)} d'après les lignes (aucune valeur ce jour-là jusqu'ici).`
          : `Valeur du ${frenchDate(preview.asOf)} : ${euros(preview.valueBeforeCents)} → ${euros(preview.valueAfterCents)} d'après les lignes.`
  return [
    `${account.name}, relevé du ${frenchDate(preview.asOf)} (${compared}) :`,
    ...preview.lines.map(lineText),
    cash,
    value,
  ]
}

export const syncSecurityPositionsTool = defineTool({
  name: 'sync_security_positions',
  title: 'Synchroniser les lignes du PEA',
  description:
    "Record the lines of a PEA read from a broker's statement (« relevé de portefeuille ») on its day: every security held that day by ISIN with its quantity, PRU (average cost per unit) and price, and the cash (« liquidités »). The statement is the whole account: a line left out was sold. Without confirm: preview of new / changed / removed / unchanged lines, the cash and the account's value that day before → after. With confirm: true writes the statement and its prices (a price typed by hand that day is kept); the account's value then follows its lines, except on a day with a value typed by hand, which keeps its day. A repeated call changes nothing. Copy the digits from the document; never compute or round them. PEA accounts only; deleting a statement is done in the app.",
  write: { idempotent: true },
  inputSchema: {
    account: z
      .string()
      .max(100)
      .describe('PEA account name (see list_investment_accounts).'),
    asOf: z
      .string()
      .regex(DATE_PATTERN)
      .describe("The statement's day, YYYY-MM-DD, never after today."),
    lines: z
      .array(
        z.object({
          isin: z
            .string()
            .max(20)
            .describe('ISIN as printed, e.g. "FR0000000000" (12 characters).'),
          name: z
            .string()
            .max(200)
            .optional()
            .describe(
              'Name of the security as printed; required the first time the app sees this ISIN.',
            ),
          quantity: z
            .string()
            .max(40)
            .describe('Number of units as text, e.g. "48" or "3,5".'),
          unitCost: z
            .string()
            .max(40)
            .optional()
            .describe('PRU in euros as text, e.g. "412,515".'),
          price: z
            .string()
            .max(40)
            .optional()
            .describe(
              'The statement\'s price per unit in euros, e.g. "498,32".',
            ),
        }),
      )
      .max(MAX_LINES)
      .describe(
        `Every line of the statement, 0 to ${MAX_LINES}, each ISIN once.`,
      ),
    cash: z
      .string()
      .max(20)
      .optional()
      .describe(
        'Cash on the account (« liquidités ») in euros, e.g. "482,24"; 0 when left out.',
      ),
    confirm: confirmSchema,
  },
  async run({ api, now }, args) {
    const account = await resolveInvestmentAccount(api, args.account)
    if (account.type !== 'brokerage') {
      throw new ToolInputError(
        `${account.name} n'est pas un PEA : seuls les PEA ont des lignes (pour une valeur, add_investment_snapshots ; pour des cryptos, sync_crypto_holdings). Rien n'a été modifié.`,
      )
    }
    const today = parisToday(now())
    if (args.asOf > today) {
      throw new ToolInputError(
        `Le ${frenchDate(args.asOf)} est dans le futur : un relevé ne peut pas être daté après aujourd'hui (${frenchDate(today)}). Rien n'a été modifié.`,
      )
    }
    const seen = new Set<string>()
    const lines: PutStatementDto['lines'] = args.lines.map((line) => {
      const isin = normalizeIsin(line.isin)
      if (!isValidIsin(isin)) {
        throw new ToolInputError(
          `ISIN « ${line.isin} » invalide (12 caractères, la clé de contrôle à la fin) : recopiez-le du relevé. Rien n'a été modifié.`,
        )
      }
      if (seen.has(isin)) {
        throw new ToolInputError(
          `${isin} apparaît deux fois : une ligne par ISIN. Rien n'a été modifié.`,
        )
      }
      seen.add(isin)
      const quantity = parseQuantity(line.quantity)
      if (quantity === null || !/[1-9]/.test(quantity)) {
        throw new ToolInputError(
          `Quantité « ${line.quantity} » invalide pour ${isin} : un nombre positif (ex. 48 ou 3,5). Rien n'a été modifié.`,
        )
      }
      const unitCost =
        line.unitCost === undefined ? undefined : parseEurPrice(line.unitCost)
      if (unitCost === null) {
        throw new ToolInputError(
          `PRU « ${line.unitCost} » invalide pour ${isin} : un montant en euros (ex. 412,52). Rien n'a été modifié.`,
        )
      }
      const price =
        line.price === undefined ? undefined : parseEurPrice(line.price)
      if (price === null || (price !== undefined && !/[1-9]/.test(price))) {
        throw new ToolInputError(
          `Cours « ${line.price} » invalide pour ${isin} : un montant en euros positif (ex. 498,32). Rien n'a été modifié.`,
        )
      }
      return {
        isin,
        ...(line.name?.trim() ? { name: line.name.trim() } : {}),
        quantity,
        ...(unitCost === undefined ? {} : { unitCostEur: unitCost }),
        ...(price === undefined ? {} : { priceEur: price }),
      }
    })
    const cash =
      args.cash === undefined ? { sign: '+', cents: 0 } : parseEuros(args.cash)
    if (!cash || cash.sign === '-') {
      throw new ToolInputError(
        `Liquidités « ${args.cash} » invalides : un montant en euros positif. Rien n'a été modifié.`,
      )
    }
    const body: PutStatementDto = { lines, cashCents: cash.cents }

    const preview = await api.send<StatementPreviewDto>(
      'POST',
      `/api/accounts/${account.id}/positions/statements/${args.asOf}/preview`,
      body,
    )
    if (preview.unknownWithoutName.length > 0) {
      throw new ToolInputError(
        `Nom manquant pour ${preview.unknownWithoutName.join(', ')} : l'application ne connaît pas encore ces ISIN, donnez le nom imprimé sur le relevé. Rien n'a été modifié.`,
      )
    }
    if (preview.unchanged) {
      return `Rien à modifier : ${account.name} a déjà ce relevé du ${frenchDate(args.asOf)}, à l'identique.`
    }
    if (args.confirm !== true) {
      return [
        PREVIEW_HEADER,
        ...previewText(account, preview),
        '',
        PREVIEW_FOOTER,
      ].join('\n')
    }

    const written = await api.send<PositionsDto>(
      'PUT',
      `/api/accounts/${account.id}/positions/statements/${args.asOf}`,
      body,
    )
    return [
      `Relevé du ${frenchDate(args.asOf)} enregistré pour ${account.name}.`,
      ...previewText(account, preview).slice(1),
      written.totals.valueCents === null
        ? ''
        : `Lignes aujourd'hui (relevé du ${frenchDate(written.asOf!)}) : ${euros(written.totals.valueCents)}.`,
      "Pour l'annuler, supprimez ce relevé dans l'application (fiche du PEA, « Lignes », « Relevés ») ; aucun outil MCP ne supprime.",
    ]
      .filter(Boolean)
      .join('\n')
  },
})
