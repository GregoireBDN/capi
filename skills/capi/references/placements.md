# Mettre à jour les placements

Enregistrer les valeurs des placements (PEA, compte-titres, assurance vie, épargne salariale, crypto) à partir des relevés du propriétaire. Souvent ses documents sont dans un dossier Google Drive (par défaut « Finances ») lu avec le connecteur Google Drive du client ; il peut aussi coller un relevé ou joindre un PDF.

## Règles propres aux placements

- Le connecteur Google Drive sert **uniquement à lire** : ne crée, ne déplace, ne modifie ni ne partage aucun fichier.
- Seules les valeurs extraites (dates, montants, quantités) passent aux outils Capi : jamais un numéro de contrat ou de compte, un nom, une adresse, le contenu d'un document.
- Recopie chiffre pour chiffre ; n'arrondis pas, ne convertis pas, ne calcule pas une valeur que le document ne donne pas.
- Ne crée jamais de compte : `create_investment_account` vérifie le nom et dit quoi créer dans l'application, le propriétaire le crée lui-même.

## Étapes

1. **État actuel** : `list_investment_accounts`. Note pour chaque compte la date de sa dernière valeur.
2. **Documents** : un sous-dossier par support (PEA, compte-titres, assurance vie, épargne salariale, plateformes et portefeuilles crypto). Associe chacun à un compte (nom, établissement). Support sans compte : `create_investment_account`, puis demande au propriétaire de le créer et reprends quand il apparaît dans `list_investment_accounts`.
3. **Quels documents** : nommés `<Support>_<Document>_<AAAA-MM[-JJ]>` (ex. `PEA_Releve_2026-09-30.pdf`). Ne traite que ceux datés après la dernière valeur du compte, sauf s'il demande de compléter l'historique. Nom hors convention : lis la date dans le document.
4. **Date de la valeur** : la date d'évaluation imprimée (« valorisation au… », « situation au… »). À défaut, la date du relevé ; pour un relevé trimestriel sans date, le dernier jour du trimestre ; pour un relevé annuel d'assurance vie, le 31/12. Si le nom du fichier et le document diffèrent, signale-le et prends celle du document. Jamais une date future.
5. **Que relever** : la valeur totale du support à cette date et, s'il les donne, les versements nets cumulés (versements − rachats). Les avis d'opéré, arbitrages et confirmations d'ordre ne donnent pas de valeur de compte : ignore-les.
6. **PEA ou compte-titres avec ses lignes** (« relevé de portefeuille ») : relève chaque ligne (ISIN, nom, quantité, PRU, cours du relevé) et les liquidités, pour `sync_security_positions` à la date du relevé. **Toutes** les lignes : une ligne absente est considérée comme vendue. La valeur du compte suit alors ses lignes : pas besoin d'`add_investment_snapshots` pour ce jour-là.
7. **Crypto** : un export Binance ou Coinbase s'importe mieux dans l'application (compte crypto de type plateforme) : dis-le plutôt que de recopier. Un portefeuille Ledger se synchronise ou s'importe dans l'application. Pour un autre relevé, relève la quantité détenue par actif ; si le fichier ne donne que des opérations, additionne-les par actif sans arrondi et montre le détail du calcul. Puis `sync_crypto_holdings` (compte crypto en saisie manuelle uniquement) avec le nom du portefeuille comme `location`, toujours écrit pareil. La valeur en euros se calcule dans l'application.
8. **Documents illisibles** (PDF scanné, page coupée, chiffre douteux) : essaie de lire l'image ; si tu n'es pas sûr de chaque chiffre, ne l'enregistre pas : liste le document et demande au propriétaire de taper la valeur.
9. **Récapitulatif avant d'écrire** : un tableau | Compte | Document | Date de la valeur | Valeur | Investi | Action (nouvelle, remplacée, déjà là) |, plus les documents ignorés ou illisibles et pourquoi.
10. **Aperçus** : un `add_investment_snapshots` par compte (toutes ses dates en un appel), un `sync_security_positions` par relevé de lignes, un `sync_crypto_holdings` par portefeuille, sans `confirm`. Montre les aperçus (dont l'effet sur le patrimoine), puis, après accord, les mêmes appels avec `confirm: true`.
11. **Fin** : `list_investment_accounts` de nouveau, et ce qui reste (comptes à créer, documents illisibles, comptes pas à jour). Relancer sur les mêmes documents ne change rien.

## Montant investi : versements ou base ?

- Le relevé donne les **versements nets** à côté de chaque valeur : passe-les avec la valeur (`contributions` d'`add_investment_snapshots`).
- Le relevé donne une valeur **sans versements** (beaucoup de PEA et d'épargne salariale) : `set_invested_amount` une fois, avec ce qu'il a investi jusqu'au jour où il le sait. Les virements liés au compte après ce jour s'y ajoutent seuls.
- Pas de crypto ici : le montant investi d'un compte crypto est le coût de ses pièces, réglé dans l'application.
- Un chiffre illisible ne se recopie pas : demande, ou laisse le montant investi inconnu.
