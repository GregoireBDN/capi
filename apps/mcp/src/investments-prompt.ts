/**
 * "Importer mes investissements" (#104): walks the owner's Google Drive
 * finance folder with the client's Google Drive connector and records the
 * values with the investment tools. The app never sees Drive: only the
 * extracted dates, amounts and quantities reach it, through confirmed previews.
 */
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { frenchDate, parisToday } from './format.js'

export const investmentsImportPromptArgs = {
  folder: z
    .string()
    .max(100)
    .optional()
    .describe('Dossier Google Drive des documents. Par défaut : « Finances ».'),
}

export function investmentsImportPrompt(
  now: Date,
  folder: string | undefined,
): GetPromptResult {
  const root = folder?.trim() || 'Finances'
  const today = frenchDate(parisToday(now))
  const text = `Mets à jour mes placements à partir de mes documents du dossier Google Drive « ${root} », avec le connecteur Google Drive pour lire et les outils du serveur finances pour enregistrer. Nous sommes le ${today}. Réponds en français, de façon concise.

Règles :
- Le connecteur Google Drive sert uniquement à lire : ne crée, ne déplace, ne modifie et ne partage aucun fichier.
- Seules les valeurs extraites (dates, montants, quantités) passent aux outils finances. Ne recopie jamais ailleurs un numéro de contrat ou de compte, un nom, une adresse ni le contenu d'un document.
- Recopie les montants et les quantités chiffre pour chiffre : n'arrondis pas, ne convertis pas, n'invente rien. Montants en euros en texte (« 12 345,67 »), quantités crypto en texte décimal exact (« 0.01234567 »).
- Toute écriture passe par l'aperçu de l'outil (sans confirm) ; attends mon accord explicite avant de rappeler avec confirm: true.
- Ne crée jamais de compte sans me demander : create_investment_account me dit quoi créer dans l'application, je le crée moi-même.

Étapes :
1. État actuel : list_investment_accounts. Note pour chaque compte la date de sa dernière valeur.
2. Dossier : trouve « ${root} » sur Drive. Il contient un sous-dossier par support (PEA, compte-titres, assurance vie, épargne salariale, plateformes et portefeuilles crypto). Associe chaque sous-dossier à un compte (nom, établissement). Pour un support sans compte : create_investment_account, puis demande-moi de le créer ; reprends ce support une fois qu'il apparaît dans list_investment_accounts.
3. Documents à traiter : les fichiers sont nommés \`<Support>_<Document>_<AAAA-MM[-JJ]>\` (ex. \`PEA_Releve_2026-09-30.pdf\`, \`AssuranceVie_Releve_2025-12.pdf\`). Ne traite que les documents datés après la dernière valeur du compte (sauf si je demande de compléter l'historique). Un nom hors convention : lis la date dans le document.
4. Date de la valeur : la date d'évaluation imprimée sur le relevé (« valorisation au… », « situation au… »). À défaut, la date du relevé ; pour un relevé trimestriel sans date, le dernier jour du trimestre ; pour un relevé annuel d'assurance vie, le 31/12 de l'année. Si le nom du fichier et le document ne disent pas la même date, signale-le et prends celle du document. Jamais une date future.
5. Que relever : la valeur totale du support à cette date et, s'il les donne, les versements nets cumulés (versements moins rachats). Les avis d'opéré, arbitrages et confirmations d'ordre ne donnent pas de valeur de compte : ignore-les. Pour un PEA ou un compte-titres dont le relevé liste ses lignes (« relevé de portefeuille ») : relève aussi chaque ligne (ISIN, nom, quantité, PRU, cours du relevé) et les liquidités, pour sync_security_positions à la date du relevé ; toutes les lignes du relevé, une ligne absente étant vendue.
6. Crypto : pour un export Binance ou Coinbase, l'import de l'application (compte crypto de type plateforme) est plus sûr : dis-le-moi plutôt que de recopier. Pour un autre export ou relevé (portefeuille matériel…), relève la quantité détenue par actif ; si le fichier ne donne que des opérations, additionne-les par actif sans arrondi, montre-moi le détail du calcul, puis sync_crypto_holdings avec le nom du portefeuille comme location (toujours le même). La valeur en euros se calcule dans l'application avec les prix.
7. Documents illisibles : un PDF scanné sans texte, une page coupée, un montant douteux → essaie de lire l'image ; si tu n'es pas sûr de chaque chiffre, ne l'enregistre pas : liste le document et demande-moi de taper la valeur.
8. Récapitulatif avant d'écrire : un tableau | Compte | Document | Date de la valeur | Valeur | Investi | Action | (nouvelle, remplacée, déjà là), plus la liste des documents ignorés ou illisibles et pourquoi.
9. Aperçus : un add_investment_snapshots par compte (toutes ses dates en un appel), un sync_security_positions par relevé de lignes d'un PEA ou d'un compte-titres et un sync_crypto_holdings par portefeuille, sans confirm. Montre-moi les aperçus (dont l'effet sur le patrimoine), puis, après mon accord, les mêmes appels avec confirm: true.
10. Fin : list_investment_accounts de nouveau, et ce qui reste à faire (comptes à créer, documents illisibles, comptes encore pas à jour). Relancer cette revue sur les mêmes documents ne doit rien changer : les outils sautent ce qui est déjà enregistré.`
  return {
    description: `Importer mes investissements depuis « ${root} »`,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  }
}
