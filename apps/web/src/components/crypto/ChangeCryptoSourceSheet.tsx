import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { AccountDto, ChangeCryptoSourceDto } from '#/api/types.gen'
import {
  afterAccountsChanged,
  updateAccount,
} from '#/components/accounts/queries'
import { ApiRequestError } from '#/lib/queries'
import {
  CRYPTO_PROVIDERS,
  CryptoSourceFields,
  cryptoProviderName,
  cryptoSourceBody,
  EMPTY_CRYPTO_SOURCE,
  validateCryptoSource,
} from './CryptoSourceFields'
import type {
  CryptoKind,
  CryptoSourceErrors,
  CryptoSourceValues,
} from './CryptoSourceFields'
import { holdingErrorMessage } from './errors'
import {
  afterHoldingsChanged,
  changeCryptoSource,
  holdingsQuery,
} from './queries'
import { walletKeyErrorMessage } from './sources'

const KINDS: readonly CryptoKind[] = ['wallet', 'exchange']

/** The source the account most likely is, from its institution ("Ledger"). */
export function guessCryptoSource(
  institution: string | null,
): CryptoSourceValues {
  const name = institution?.trim().toLowerCase() ?? ''
  for (const kind of KINDS) {
    const kindKey = kind as Exclude<CryptoKind, 'manual'>
    const provider = CRYPTO_PROVIDERS[kindKey].find(
      (candidate) => candidate.toLowerCase() === name,
    )
    if (provider) return { ...EMPTY_CRYPTO_SOURCE, cryptoKind: kind, provider }
  }
  return EMPTY_CRYPTO_SOURCE
}

function changeErrorMessage(error: unknown): string {
  const key = walletKeyErrorMessage(error)
  if (key) return key
  if (error instanceof ApiRequestError && error.status === 409) {
    return /holdings/i.test(error.apiMessage ?? '')
      ? 'Supprimez d’abord les avoirs saisis à la main : ils seraient comptés deux fois.'
      : 'Ce compte n’est plus en saisie manuelle : rechargez la page.'
  }
  return holdingErrorMessage(error)
}

/**
 * Turns a manual crypto account into a wallet (read from its public keys) or
 * an exchange (fed by its exports), e.g. one set up by hand before (#207).
 * Only an account holding nothing changes source, so hand-entered lines are
 * never counted twice next to synced or imported ones.
 */
export function ChangeCryptoSourceSheet({
  open,
  onOpenChange,
  account,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: AccountDto
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [values, setValues] = useState<CryptoSourceValues>(EMPTY_CRYPTO_SOURCE)
  const [submitted, setSubmitted] = useState(false)
  const [keyError, setKeyError] = useState<string>()
  const holdings = useQuery({ ...holdingsQuery(account.id), enabled: open })
  const held = holdings.data?.holdings.length ?? 0

  // Fresh form on every opening, guessed from the account's institution.
  useEffect(() => {
    if (!open) return
    setValues(guessCryptoSource(account.institution))
    setSubmitted(false)
    setKeyError(undefined)
  }, [open, account.institution])

  const errors = validateCryptoSource(values, { withSource: true })
  const shown: CryptoSourceErrors = submitted
    ? { ...errors, ...(keyError && { walletKeysError: keyError }) }
    : {}

  const change = useMutation({
    mutationFn: async () => {
      const changed = await changeCryptoSource(
        account.id,
        cryptoSourceBody(values) as ChangeCryptoSourceDto,
      )
      // The account shows its exchange or wallet: keep the name chosen here.
      const name = cryptoProviderName(values)
      if (name && name !== account.institution) {
        try {
          return await updateAccount(account.id, { institution: name })
        } catch {
          // The source changed: a stale institution is only cosmetic.
        }
      }
      return changed
    },
    onSuccess: async (changed) => {
      toast.success(
        changed.cryptoSource === 'wallet'
          ? 'Compte relié au wallet : ses avoirs seront lus avec ses clés'
          : 'Compte relié à la plateforme : importez un export',
      )
      onOpenChange(false)
      await Promise.all([
        afterAccountsChanged(queryClient),
        afterHoldingsChanged(queryClient),
      ])
    },
    onError: (error) => {
      const message = walletKeyErrorMessage(error)
      if (message) setKeyError(message)
      toast.error(changeErrorMessage(error))
    },
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (held === 0 && Object.keys(errors).length === 0) change.mutate()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={
          isMobile
            ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
            : 'overflow-y-auto'
        }
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Relier à un wallet ou une plateforme</SheetTitle>
          <SheetDescription>
            Les avoirs ne seront plus saisis à la main : ils seront lus avec les
            clés publiques du wallet, ou calculés depuis les exports de la
            plateforme.
          </SheetDescription>
        </SheetHeader>
        <form noValidate onSubmit={submit} className="space-y-4 px-4 pb-6">
          {held > 0 && (
            <Alert variant="warning">
              <AlertTitle>Ce compte a des avoirs saisis à la main</AlertTitle>
              <AlertDescription>
                Supprimez-les d’abord : ils seraient comptés deux fois à côté
                des avoirs lus ou importés.
              </AlertDescription>
            </Alert>
          )}
          <CryptoSourceFields
            id={id}
            values={values}
            errors={shown}
            withSource
            kinds={KINDS}
            onChange={(patch) => {
              if ('walletKeys' in patch || 'cryptoKind' in patch)
                setKeyError(undefined)
              setValues((current) => ({ ...current, ...patch }))
            }}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={held > 0}
            loading={change.isPending}
          >
            {values.cryptoKind === 'exchange'
              ? 'Relier à la plateforme'
              : 'Relier au wallet'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
