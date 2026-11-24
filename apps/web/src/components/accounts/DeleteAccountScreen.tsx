import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Skeleton,
} from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlertIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import type { AccountDeletionPreviewDto, AccountDto } from '#/api/types.gen'
import { ReauthSheet } from '#/components/auth/ReauthSheet'
import {
  FORM_SHEET_FORM,
  FormSheetBody,
  FormSheetMoreActions,
} from '#/components/sheets/form-sheet'
import { useAuth } from '#/lib/auth-context'
import { needsReauth } from '#/lib/reauth'
import { accountErrorMessage } from './errors'
import { isInvestmentType } from './labels'
import { deleteAccount, deletionPreviewQuery } from './queries'

const COUNT = new Intl.NumberFormat('fr-FR')

function count(n: number, one: string, many: string): string {
  return `${COUNT.format(n)} ${n === 1 ? one : many}`
}

/** What goes with the account, one line per kind of data it has (#297). */
export function deletionLines(
  preview: AccountDeletionPreviewDto,
  account: Pick<AccountDto, 'type'>,
): string[] {
  const lines: [number, string, string][] = [
    [preview.transactions, 'opération', 'opérations'],
    [preview.imports, 'import', 'imports'],
    isInvestmentType(account.type)
      ? [preview.snapshots, 'valeur', 'valeurs']
      : [preview.snapshots, 'solde enregistré', 'soldes enregistrés'],
    [preview.cryptoHoldings, 'avoir crypto', 'avoirs crypto'],
    [preview.positionStatements, 'relevé de lignes', 'relevés de lignes'],
    [preview.dividends, 'dividende', 'dividendes'],
    [preview.walletKeys, 'clé ou jeton de wallet', 'clés ou jetons de wallet'],
    [preview.recurringItems, 'abonnement détecté', 'abonnements détectés'],
    [
      preview.rules,
      'règle de catégorisation propre à ce compte',
      'règles de catégorisation propres à ce compte',
    ],
  ]
  const result = lines
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => count(n, one, many))
  if (preview.savingsGoals > 0)
    result.push(
      `son lien avec ${count(preview.savingsGoals, 'objectif d’épargne', 'objectifs d’épargne')}`,
    )
  return result
}

/** Typed names match whatever the case and spacing (iOS capitalises). */
function sameName(typed: string, name: string): boolean {
  const normalize = (s: string) =>
    s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR')
  return normalize(typed) !== '' && normalize(typed) === normalize(name)
}

/**
 * The account editor's last screen (#297): what deleting the account removes,
 * that it cannot be undone, and the account's name to type before
 * « Supprimer définitivement ». The API wants a recent sign-in: when the
 * session is older, `ReauthSheet` asks for the password or a passkey, then a
 * last press deletes.
 */
export function DeleteAccountScreen({
  account,
  onDeleted,
}: {
  account: AccountDto
  onBack: () => void
  /** Called once the account is gone (closes the editor, leaves its page). */
  onDeleted: () => Promise<void> | void
}) {
  const id = useId()
  const { user } = useAuth()
  const preview = useQuery(deletionPreviewQuery(account.id))
  const [typed, setTyped] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reauthOpen, setReauthOpen] = useState(false)
  const matches = sameName(typed, account.name)

  async function remove() {
    setDeleting(true)
    try {
      await deleteAccount(account.id)
    } catch (error) {
      setDeleting(false)
      if (needsReauth(error)) setReauthOpen(true)
      else toast.error(accountErrorMessage(error))
      return
    }
    toast.success(`Compte « ${account.name} » supprimé`)
    await onDeleted()
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (matches && preview.isSuccess && !deleting) void remove()
  }

  const lines = preview.data ? deletionLines(preview.data, account) : []
  const closedMonths = preview.data?.closedMonths ?? 0

  return (
    <>
      <form noValidate onSubmit={submit} className={FORM_SHEET_FORM}>
        <FormSheetBody>
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>
              Définitif : rien ne pourra être récupéré. Pour le garder sans le
              voir, archivez-le plutôt.
            </AlertDescription>
          </Alert>
          <div className="space-y-2 text-sm" aria-live="polite">
            {preview.isPending ? (
              <div className="space-y-2" aria-label="Chargement">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : preview.isError ? (
              <p className="text-destructive">
                Impossible de savoir ce qui sera supprimé.{' '}
                <Button
                  type="button"
                  variant="secondary"
                  ghost
                  size="sm"
                  onClick={() => void preview.refetch()}
                >
                  Réessayer
                </Button>
              </p>
            ) : lines.length === 0 ? (
              <p>
                Ce compte ne contient aucune donnée : seul le compte disparaît.
              </p>
            ) : (
              <>
                <p className="font-medium">Seront supprimés avec le compte :</p>
                <ul className="list-disc space-y-1 pl-5">
                  {lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}
            {preview.isSuccess && (
              <p className="text-muted-foreground">
                Budgets et catégories ne changent pas.
                {closedMonths > 0 &&
                  ` ${
                    closedMonths === 1
                      ? 'Le mois clôturé qui contient ses données garde ses chiffres'
                      : `Les ${COUNT.format(closedMonths)} mois clôturés qui contiennent ses données gardent leurs chiffres`
                  } : leur revue montrera l’écart.`}
              </p>
            )}
          </div>
          <Field data-invalid={submitted && !matches}>
            <FieldLabel htmlFor={`${id}-name`}>
              Pour confirmer, saisissez « {account.name} »
            </FieldLabel>
            <Input
              id={`${id}-name`}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={account.name}
              value={typed}
              aria-invalid={submitted && !matches}
              onChange={(event) => setTyped(event.target.value)}
            />
            {submitted && !matches && (
              <FieldError>Le nom ne correspond pas.</FieldError>
            )}
          </Field>
          {/* A phone: the bar's ‹ goes back, the deletion ends the page. */}
          <FormSheetMoreActions>
            <Button
              type="submit"
              variant="danger"
              className="font-medium"
              disabled={!matches || !preview.isSuccess}
              loading={deleting}
            >
              Supprimer définitivement
            </Button>
          </FormSheetMoreActions>
        </FormSheetBody>
        {/* « Retour » on a line of its own when both don't fit. */}
      </form>
      {/* Outside the form: React submit events bubble through portals. */}
      <ReauthSheet
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        email={user?.email ?? ''}
        purpose={`supprimer « ${account.name} »`}
        continueLabel="Supprimer définitivement"
        continueDescription={`Dernière étape : « ${account.name} » et ses données seront définitivement supprimés.`}
        continueVariant="danger"
        onContinue={() => {
          setReauthOpen(false)
          void remove()
        }}
      />
    </>
  )
}
