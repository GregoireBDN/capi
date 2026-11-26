# Importer un relevé bancaire

Pour un compte courant ou un livret (les comptes bancaires). Deux temps, comme la page Relevés de l'application : `preview_bank_import` (n'écrit aucune opération) puis `commit_bank_import` avec `confirm: true` après l'accord du propriétaire.

## 1. Savoir ce qui manque

`list_imports` : pour chaque compte, le dernier import et le jour jusqu'où vont ses relevés, plus les aperçus en attente. Repère la période à importer.

## 2. Le fichier

- **Export CSV du CIC** tel que téléchargé : passe-le tel quel. Sur la connexion locale (Claude Desktop, Claude Code), `filePath` avec le chemin du fichier sur la machine (`~/Downloads/export.csv`, 5 Mo au plus). Sur la connexion distante (claude.ai, téléphone), `content` avec le texte du fichier : jamais `filePath`.
- **CSV d'un format déjà enregistré** dans l'application (une autre banque mappée une fois sur la page Relevés) : tel quel, l'application reconnaît son en-tête.
- **Tout autre relevé** (PDF, export d'une autre banque, tableau collé dans la conversation) : convertis-le au **format standard** ci-dessous et passe-le dans `content`. Le propriétaire le valide dans l'aperçu habituel.

## 3. Le format standard

```csv
date;amount;label;balance
2026-10-01;-12.50;CARTE 01/10 BOULANGERIE FICTIVE;987.50
2026-10-03;2000.00;VIR SALAIRE EMPLOYEUR FICTIF;2987.50
```

- En-tête obligatoire : `date;amount;label`, plus `balance` (solde après la ligne, recommandé : il permet le contrôle de continuité) et `value_date` (date de valeur), facultatives. Colonnes dans n'importe quel ordre ; une colonne inconnue est listée dans l'aperçu et ignorée.
- `date` : `AAAA-MM-JJ`, la date d'opération du relevé.
- `amount` : euros signés, **négatif = sortie d'argent**. `.` ou `,` comme séparateur décimal, au plus 2 décimales, pas de séparateur de milliers sauf l'espace (`-1 234,56`). `1.234,56` est refusé.
- `label` : le libellé **tel que la banque l'imprime** (il sert au dédoublonnage et à la catégorisation) : ne le reformule pas, ne le traduis pas.
- **Une ligne par opération du relevé, dans l'ordre du relevé.** Deux paiements identiques le même jour font deux lignes : ne fusionne rien, ne supprime rien.
- UTF-8 ; séparateur `;` (ou `,`, ou tabulation) ; mets entre guillemets un libellé qui contient le séparateur (`"CAFE; FICTIF"`).
- Recopie les montants chiffre pour chiffre. Si une ligne d'un PDF est illisible, dis-le plutôt que de deviner.

Avant d'envoyer une conversion, vérifie : premier solde − montant de la première ligne = solde précédent du relevé, et la somme des montants = solde final − solde initial. Signale un écart.

## 4. L'aperçu

`preview_bank_import` (account, filePath ou content, fileName facultatif) renvoie un `previewId` et :

- les lignes nouvelles, déjà importées (réimporter un fichier ou une période qui chevauche n'ajoute rien), en conflit (doublon probable venant d'une autre source, par ex. une opération saisie à la main) ;
- le contrôle de continuité du solde (une ligne manquante se voit ici) ;
- les catégories proposées par les règles ;
- les colonnes ignorées et les lignes illisibles : jamais importées.

Montre-le au propriétaire, résume les conflits et les trous de solde. Un « Format non reconnu » donne le format standard : convertis et renvoie dans `content`.

## 5. Valider

Après son accord : `commit_bank_import` (previewId, `confirm: true`). Les conflits restent de côté, sauf s'il dit que ce ne sont pas des doublons (`includeConflicts: true`). La réponse liste les opérations parties dans la file « À revoir », avec leur id : enchaîne sur leur classement ([operations.md](operations.md)). Un aperçu expire après 24 heures ; valider deux fois ne change rien. Annuler un import se fait dans l'application (page Relevés).
