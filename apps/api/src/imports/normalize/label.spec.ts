import { describe, expect, it } from 'vitest'
import {
  MAX_MERCHANT_LENGTH,
  normalizeLabel,
  type NormalizedLabel,
  type OperationType,
} from './label'

// Every label, name and reference below is synthetic.

type Case = [
  label: string,
  amountCents: number,
  operationType: OperationType,
  merchant: string | null,
  merchantKey: string | null,
  city?: string | null,
  operationDate?: string | null,
]

const CARD_TRAILER = 'CARTE 0000 UIR100200300400500600'

// prettier-ignore
const CASES: Case[] = [
  // --- Card payments (CB and PSC) ---------------------------------------
  [`PAIEMENT CB 0410 PARIS UBR* PENDING UBE ${CARD_TRAILER}`, -1250, 'card_payment', 'Uber', 'UBER', 'Paris', '0410'],
  [`PAIEMENT PSC 0410 LYON BOULANGERIE DUPONT ${CARD_TRAILER}`, -320, 'card_payment', 'Boulangerie Dupont', 'BOULANGERIE DUPONT', 'Lyon', '0410'],
  [`PAIEMENT PSC 0510 LUXEMBOURG EXEMPLESHOP K7QZP2M9XR4T WWW ${CARD_TRAILER}`, -999, 'card_payment', 'Exempleshop', 'EXEMPLESHOP', 'Luxembourg', '0510'],
  [`PAIEMENT CB 0710 CORK APPLE COM/BILL ${CARD_TRAILER}`, -299, 'card_payment', 'Apple', 'APPLE', 'Cork', '0710'],
  [`PAIEMENT CB 1209 AMSTERDAM UBER *TRIP ${CARD_TRAILER}`, -1840, 'card_payment', 'Uber', 'UBER', 'Amsterdam', '1209'],
  [`PAIEMENT CB 1209 PARIS UBER EATS ${CARD_TRAILER}`, -2150, 'card_payment', 'Uber Eats', 'UBER EATS', 'Paris', '1209'],
  [`PAIEMENT CB 0302 LUXEMBOURG AMAZON MKTPLACE ${CARD_TRAILER}`, -4599, 'card_payment', 'Amazon', 'AMAZON', 'Luxembourg', '0302'],
  [`PAIEMENT CB 0302 AMZN MKTP FR ${CARD_TRAILER}`, -1299, 'card_payment', 'Amazon', 'AMAZON', null, '0302'],
  [`PAIEMENT CB 1511 PARIS PAYPAL *EXEMPLESHOP ${CARD_TRAILER}`, -2500, 'card_payment', 'PayPal', 'PAYPAL', 'Paris', '1511'],
  [`PAIEMENT PSC 2112 PARIS OUI.SNCF ${CARD_TRAILER}`, -6700, 'card_payment', 'SNCF', 'SNCF', 'Paris', '2112'],
  [`PAIEMENT CB 0101 LE MANS SARL GARAGE EXEMPLE ${CARD_TRAILER}`, -15000, 'card_payment', 'Garage Exemple', 'GARAGE EXEMPLE', 'Le Mans', '0101'],
  [`PAIEMENT CB 1803 ST ETIENNE CAFE DE LA GARE ${CARD_TRAILER}`, -450, 'card_payment', 'Cafe de la Gare', 'CAFE DE LA GARE', 'St Etienne', '1803'],
  [`PAIEMENT CB 1803 NANTES CRÊPERIE DES ÎLES ${CARD_TRAILER}`, -1890, 'card_payment', 'Crêperie des Îles', 'CREPERIE DES ILES', 'Nantes', '1803'],
  [`  paiement   cb  0410   paris   intermarché  express  carte 0000 uir100200300400500600  `, -3412, 'card_payment', 'Intermarché Express', 'INTERMARCHE EXPRESS', 'Paris', '0410'],
  [`PAIEMENT CB 2007 PARIS DELICATESSEN ${CARD_TRAILER}`, -870, 'card_payment', 'Delicatessen', 'DELICATESSEN', 'Paris', '2007'],
  [`PAIEMENT CB 0904 SAINT-MALO L'ATELIER D'ICI SAS ${CARD_TRAILER}`, -2400, 'card_payment', "L'Atelier d'Ici", 'L ATELIER D ICI', 'Saint-Malo', '0904'],
  [`PAIEMENT CB 0904 LONDON PRET EXEMPLE 12,50 GBP ${CARD_TRAILER}`, -1460, 'card_payment', 'Pret Exemple', 'PRET EXEMPLE', 'London', '0904'],
  [`PAIEMENT CB 0904 PARIS SUMUP *CAFE DU COIN ${CARD_TRAILER}`, -380, 'card_payment', 'Cafe du Coin', 'CAFE DU COIN', 'Paris', '0904'],
  [`PAIEMENT CB 0904 BERLIN WWW.EXEMPLE-SHOP.DE ${CARD_TRAILER}`, -5900, 'card_payment', 'Exemple-Shop', 'EXEMPLE SHOP', 'Berlin', '0904'],
  [`PAIEMENT CB 0410 PARIS H & M ${CARD_TRAILER}`, -2999, 'card_payment', 'H & M', 'H M', 'Paris', '0410'],
  [`PAIEMENT PSC 0410 PARIS SFR BOUTIQUE ${CARD_TRAILER}`, -1999, 'card_payment', 'SFR Boutique', 'SFR BOUTIQUE', 'Paris', '0410'],
  [`PAIEMENT CB 0410 PARIS NETFLIX.COM ${CARD_TRAILER}`, -1349, 'card_payment', 'Netflix', 'NETFLIX', 'Paris', '0410'],
  [`PAIEMENT PSC 0410 TOULOUSE ${CARD_TRAILER}`, -500, 'card_payment', null, null, 'Toulouse', '0410'],
  ['PAIEMENT CB', -100, 'card_payment', null, null],

  // --- Cash withdrawals -------------------------------------------------
  [`RETRAIT DAB 0410 PARIS CIC PARIS OPERA ${CARD_TRAILER}`, -6000, 'cash_withdrawal', 'CIC Paris Opera', 'CIC PARIS OPERA', 'Paris', '0410'],
  [`RETRAIT DAB 2509 LISBOA ${CARD_TRAILER}`, -4000, 'cash_withdrawal', null, null, 'Lisboa', '2509'],
  ['RETRAIT GUICHET AGENCE EXEMPLE', -20000, 'cash_withdrawal', 'Guichet Agence Exemple', 'GUICHET AGENCE EXEMPLE'],

  // --- Direct debits ----------------------------------------------------
  ['PRLV SEPA ACME ASSURANCE MOBIL 2093847561029384756102938475610', -1599, 'direct_debit', 'Acme Assurance Mobil', 'ACME ASSURANCE MOBIL'],
  ['PRLV SEPA MUTUELLE EXEMPLE P -PRELEV 0907202611 04829163750', -4520, 'direct_debit', 'Mutuelle Exemple', 'MUTUELLE EXEMPLE'],
  ['PRLV SEPA SOCIETE IMMO EXEMPLE MARTIN / DURAND LOYER MARS', -85000, 'direct_debit', 'Societe Immo Exemple Martin', 'SOCIETE IMMO EXEMPLE MARTIN'],
  ['PRLV SEPA EDF CLIENTS PARTICULIERS 7738291045', -7200, 'direct_debit', 'EDF Clients Particuliers', 'EDF CLIENTS PARTICULIERS'],
  ['PRLV SEPA PAYPAL EUROPE S.A.R.L. ET CIE S.C.A 1038475610293847', -1500, 'direct_debit', 'PayPal', 'PAYPAL'],
  ['PRLV SEPA OPERATEUR EXEMPLE FM-12345678-1', -1999, 'direct_debit', 'Operateur Exemple', 'OPERATEUR EXEMPLE'],
  ['PRLV SEPA SPOTIFY AB 73829104', -1199, 'direct_debit', 'Spotify', 'SPOTIFY'],
  ['PRLV SEPA', -1000, 'direct_debit', null, null],

  // --- Instant transfers (one type, direction = amount sign) -------------
  ['VIR INST JEAN DUPONT VIREMENT DEPUIS BANQUE X 6182736450918273', 5000, 'instant_transfer', 'Jean Dupont', 'JEAN DUPONT'],
  ['VIR INST M OU MME JEAN DUPONT MOTIF LIBRE 6182736450918274', 3000, 'instant_transfer', 'Jean Dupont', 'JEAN DUPONT'],
  ['VIR INST MARIE MARTIN C38X41592K067723', -2000, 'instant_transfer', 'Marie Martin', 'MARIE MARTIN'],
  ['VIR INST MME PAULINE DURAND', -1500, 'instant_transfer', 'Pauline Durand', 'PAULINE DURAND'],

  // --- Plain transfers (direction from the sign) -------------------------
  ['VIR CAF EXEMPLE 49283746X21', 12000, 'transfer_in', 'CAF Exemple', 'CAF EXEMPLE'],
  ['VIR M PAUL DURAND REF 99812', -50000, 'transfer_out', 'Paul Durand', 'PAUL DURAND'],
  ['VIREMENT EMPLOYEUR EXEMPLE SAS 20261031', 250000, 'transfer_in', 'Employeur Exemple', 'EMPLOYEUR EXEMPLE'],
  ['VIR SEPA LIVRET EXEMPLE', -10000, 'transfer_out', 'Livret Exemple', 'LIVRET EXEMPLE'],
  ['VIR', 100, 'transfer_in', null, null],

  // --- Bank fees --------------------------------------------------------
  ['F COTIS CARTE PARCOURS J', -350, 'bank_fee', 'Cotis Carte Parcours J', 'COTIS CARTE PARCOURS J'],
  ['F VIR. INSTANTANES EMIS DU MOI - 1 VIR, MOIS JUIN 23', -100, 'bank_fee', 'Vir Instantanes Emis du Moi', 'VIR INSTANTANES EMIS DU MOI'],
  ['FRAIS RETR 22/09 52 11 EUR IIR472918364501928', -320, 'bank_fee', 'Frais Retr', 'FRAIS RETR'],
  ['COMMISSION INTERVENTION', -800, 'bank_fee', 'Commission Intervention', 'COMMISSION INTERVENTION'],

  // --- Cheques ----------------------------------------------------------
  ['REM CHQ N4820193 REF5502918374', 15000, 'cheque_deposit', null, null],
  ['REMISE CHEQUES 2', 30000, 'cheque_deposit', null, null],
  ['CHQ 7654321', -4500, 'cheque', null, null],

  // --- Interest ---------------------------------------------------------
  ['INTERETS 2025', 1234, 'interest', null, null],
  ['INT CREDITEURS', 210, 'interest', null, null],

  // --- Lookalikes that must not match a pattern ---------------------------
  ['VIRGIN RADIO SHOP', -1000, 'other', 'Virgin Radio Shop', 'VIRGIN RADIO SHOP'],
  ['FNAC PARIS', -3000, 'other', 'Fnac Paris', 'FNAC PARIS'],
  ['INTERMARCHE SUPER', -5000, 'other', 'Intermarche Super', 'INTERMARCHE SUPER'],
  ['CHQUE CADEAU EXEMPLE', -2000, 'other', 'Chque Cadeau Exemple', 'CHQUE CADEAU EXEMPLE'],

  // --- Unknown formats and edge cases ----------------------------------
  ['', 0, 'other', null, null],
  ['   ', 0, 'other', null, null],
  ['ACHAT DIVERS 99887766554433', -700, 'other', 'Achat Divers', 'ACHAT DIVERS'],
  ['AVOIR CB 0410 EXEMPLESHOP', 1500, 'other', 'Avoir CB 0410 Exempleshop', 'AVOIR CB 0410 EXEMPLESHOP'],
  ['12345678901234', 100, 'other', null, null],
  ['***', -100, 'other', null, null],
]

function expected([
  ,
  ,
  operationType,
  merchant,
  merchantKey,
  city = null,
  operationDate = null,
]: Case): NormalizedLabel {
  return { operationType, merchant, merchantKey, city, operationDate }
}

describe('normalizeLabel', () => {
  it.each(CASES)('%s (%i)', (label, amountCents, ...rest) => {
    expect(normalizeLabel(label, amountCents)).toEqual(
      expected([label, amountCents, ...rest]),
    )
  })

  it('covers every operation type', () => {
    const types = new Set(CASES.map(([, , type]) => type))
    expect([...types].sort()).toEqual(
      [
        'bank_fee',
        'card_payment',
        'cash_withdrawal',
        'cheque',
        'cheque_deposit',
        'direct_debit',
        'instant_transfer',
        'interest',
        'other',
        'transfer_in',
        'transfer_out',
      ].sort(),
    )
  })

  it('always returns uppercase ASCII merchant keys', () => {
    for (const [label, amountCents] of CASES) {
      const { merchantKey } = normalizeLabel(label, amountCents)
      if (merchantKey !== null) {
        expect(merchantKey).toMatch(/^[A-Z0-9]+( [A-Z0-9]+)*$/)
      }
    }
  })

  it('groups the same merchant across dates, cities and references', () => {
    const keys = [
      `PAIEMENT CB 0410 PARIS UBR* PENDING UBE ${CARD_TRAILER}`,
      'PAIEMENT PSC 1112 LYON UBER *TRIP CARTE 1111 UIR999888777666555444',
      'PAIEMENT CB 0101 AMSTERDAM UBER BV CARTE 0000 UIR111222333444555666',
    ].map((label) => normalizeLabel(label, -1000).merchantKey)
    expect(new Set(keys)).toEqual(new Set(['UBER']))

    const debits = [
      'PRLV SEPA ACME ASSURANCE MOBIL 2093847561029384756102938475610',
      'PRLV SEPA ACME ASSURANCE MOBIL 5544332211009988776655443322110',
    ].map((label) => normalizeLabel(label, -1599).merchantKey)
    expect(new Set(debits)).toEqual(new Set(['ACME ASSURANCE MOBIL']))
  })

  it('keeps instant transfers as one type whatever the sign', () => {
    const label = 'VIR INST JEAN DUPONT 6182736450918273'
    expect(normalizeLabel(label, 1000).operationType).toBe('instant_transfer')
    expect(normalizeLabel(label, -1000).operationType).toBe('instant_transfer')
  })

  it('caps the merchant to the column length', () => {
    const longName = Array.from({ length: 80 }, () => 'EXEMPLES').join(' ')
    const { merchant, merchantKey } = normalizeLabel(longName, -100)
    expect(merchant?.length).toBeLessThanOrEqual(MAX_MERCHANT_LENGTH)
    expect(merchant).toBe(merchant?.trim())
    // Cut on a word boundary, never mid-word.
    expect(merchantKey).toMatch(/^EXEMPLES( EXEMPLES)*$/)
  })

  it('does not alter the raw label', () => {
    const raw = `  PAIEMENT CB 0410 PARIS UBR* PENDING UBE ${CARD_TRAILER} `
    const copy = raw.slice()
    normalizeLabel(raw, -1250)
    expect(raw).toBe(copy)
  })

  it('never throws on truncated or malformed labels', () => {
    const prefixes = [
      'PAIEMENT CB',
      'PAIEMENT PSC 0410',
      'RETRAIT DAB',
      'PRLV SEPA',
      'VIR INST',
      'VIR',
      'F',
      'REM CHQ',
      'INT',
    ]
    const noise = [
      '',
      ' ',
      '*',
      '/',
      ' - ',
      ',',
      '&',
      "'",
      '-',
      'CARTE 1234',
      '0410',
      'é',
      '\t\n',
      '12,50',
      'M OU MME',
      'MOTIF',
    ]
    for (const prefix of prefixes) {
      for (const a of noise) {
        for (const b of noise) {
          const label = `${prefix} ${a} ${b}`
          for (const amount of [-1, 0, 1]) {
            expect(() => normalizeLabel(label, amount)).not.toThrow()
          }
        }
      }
    }
    expect(() =>
      normalizeLabel(undefined as unknown as string, 0),
    ).not.toThrow()
  })
})
