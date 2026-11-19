import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  useIsMobile,
} from '@finances/ui'
import { cn } from '@finances/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { toast } from 'sonner'
import {
  accessTokenAuditQuery,
  accessTokenErrorMessage,
  accessTokenKeys,
  renameAccessToken,
  revokeAccessToken,
} from '#/components/access-tokens/queries'
import {
  grantErrorMessage,
  oauthAuditQuery,
  oauthKeys,
  revokeGrant,
} from '#/components/oauth/queries'
import {
  callLines,
  endLabel,
  formatAge,
  formatDay,
  SCOPE_LABELS,
} from './access-labels'
import type { AuditCall } from './access-labels'
import type { AccessItem } from './accesses'

const NAME_MAX = 100

/**
 * The detail of an access (#329): what it may do, its last use, its end,
 * its last calls in plain words, then « Renommer » (tokens) and « Révoquer »
 * / « Déconnecter » behind a confirmation. A bottom sheet on phones, a
 * right-hand sheet elsewhere.
 */
export function AccessDetailSheet({
  access,
  onClose,
}: {
  /** The access shown; `null` when closed. */
  access: AccessItem | null
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  // Kept while the sheet animates out.
  const [shown, setShown] = useState<AccessItem | null>(access)
  const [screen, setScreen] = useState<'main' | 'rename'>('main')
  useEffect(() => {
    if (access) {
      setShown(access)
      setScreen('main')
    }
  }, [access])

  return (
    <Sheet
      open={access !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'gap-0',
          isMobile
            ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
            : 'overflow-y-auto',
        )}
      >
        {shown &&
          (screen === 'rename' && shown.kind === 'token' ? (
            <RenameScreen
              access={shown}
              onBack={() => setScreen('main')}
              onRenamed={(name) => {
                setShown({ ...shown, name })
                setScreen('main')
              }}
            />
          ) : (
            <MainScreen
              access={shown}
              onRename={() => setScreen('rename')}
              onRevoked={onClose}
            />
          ))}
      </SheetContent>
    </Sheet>
  )
}

function useCalls(access: AccessItem): {
  calls: AuditCall[]
  pending: boolean
  failed: boolean
} {
  const tokenAudit = useQuery({
    ...accessTokenAuditQuery(access.id),
    enabled: access.kind === 'token',
  })
  const appAudit = useQuery({
    ...oauthAuditQuery,
    enabled: access.kind === 'app',
  })
  const query = access.kind === 'token' ? tokenAudit : appAudit
  const calls = useMemo(() => {
    if (access.kind === 'token') return tokenAudit.data ?? []
    return (appAudit.data ?? []).filter((call) => call.grantId === access.id)
  }, [access, tokenAudit.data, appAudit.data])
  return { calls, pending: query.isPending, failed: query.isError }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 px-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  )
}

function MainScreen({
  access,
  onRename,
  onRevoked,
}: {
  access: AccessItem
  onRename: () => void
  onRevoked: () => void
}) {
  const queryClient = useQueryClient()
  const now = new Date()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { calls, pending, failed } = useCalls(access)
  const lines = useMemo(() => callLines(calls), [calls])
  const isApp = access.kind === 'app'

  const revoke = useMutation({
    mutationFn: () =>
      isApp ? revokeGrant(access.id) : revokeAccessToken(access.id),
    onSuccess: async () => {
      toast.success(
        isApp ? `${access.name} déconnecté` : `Accès ${access.name} révoqué`,
      )
      setConfirmOpen(false)
      onRevoked()
      await queryClient.invalidateQueries({
        queryKey: isApp ? oauthKeys.all : accessTokenKeys.all,
      })
    },
    onError: (error) =>
      toast.error(
        isApp ? grantErrorMessage(error) : accessTokenErrorMessage(error),
      ),
  })

  return (
    <>
      <SheetHeader className="pr-12">
        <SheetTitle className="break-words">{access.name}</SheetTitle>
        <SheetDescription>
          {isApp
            ? `Connecteur ${access.host ?? ''}, connecté le ${formatDay(access.createdAt)}`
            : `Créé le ${formatDay(access.createdAt)}`}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4 pb-6">
        <dl className="bg-card divide-y rounded-xl border">
          <Fact label="Peut" value={SCOPE_LABELS[access.scope]} />
          <Fact
            label="Dernière utilisation"
            value={
              access.lastUsedAt ? formatAge(access.lastUsedAt, now) : 'jamais'
            }
          />
          <Fact
            label="Fin"
            value={
              isApp && !access.expired && access.expiresAt
                ? `à renouveler le ${formatDay(access.expiresAt)}`
                : endLabel(access.expiresAt, access.expired)
            }
          />
        </dl>

        <section className="space-y-2" aria-labelledby="access-calls">
          <h4 id="access-calls" className="text-sm font-medium">
            Ce qu’il a fait
          </h4>
          {pending ? (
            <Skeleton className="h-24 w-full" />
          ) : failed ? (
            <p className="text-destructive text-sm">
              Impossible de lire ses derniers appels.
            </p>
          ) : lines.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Rien pour l’instant.
            </p>
          ) : (
            <ul
              aria-label="Derniers appels"
              className="bg-card divide-y rounded-xl border text-sm"
            >
              {lines.map((line) => (
                <li
                  key={line.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2"
                >
                  <span className="min-w-[8rem] flex-1">{line.label}</span>
                  {line.refused && (
                    <Badge variant="danger" outline>
                      Refusé
                    </Badge>
                  )}
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatAge(line.createdAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground text-xs">
            Les appels sont gardés 90 jours, sans les montants ni les libellés.
          </p>
        </section>

        <div className="space-y-2">
          {!isApp && (
            <Button
              type="button"
              variant="secondary"
              outline
              className="w-full justify-between"
              onClick={onRename}
            >
              Renommer
              <ChevronRightIcon aria-hidden />
            </Button>
          )}
          <Button
            type="button"
            variant="danger"
            outline
            className="w-full"
            onClick={() => setConfirmOpen(true)}
          >
            {isApp ? 'Déconnecter' : 'Révoquer'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          isApp
            ? `Déconnecter ${access.name}\u00a0?`
            : `Révoquer ${access.name}\u00a0?`
        }
        description={
          isApp
            ? 'L’application perd l’accès immédiatement. Pour la reconnecter, ajoutez à nouveau le connecteur depuis Claude.'
            : 'Ce qui l’utilise perd l’accès immédiatement. C’est définitif : pour reconnecter, créez un nouvel accès.'
        }
        confirmLabel={isApp ? 'Déconnecter' : 'Révoquer'}
        variant="danger"
        loading={revoke.isPending}
        onConfirm={() => revoke.mutate()}
      />
    </>
  )
}

function RenameScreen({
  access,
  onBack,
  onRenamed,
}: {
  access: AccessItem
  onBack: () => void
  onRenamed: (name: string) => void
}) {
  const id = useId()
  const queryClient = useQueryClient()
  const [name, setName] = useState(access.name)
  const [submitted, setSubmitted] = useState(false)
  const error = name.trim() === '' ? 'Donnez-lui un nom.' : undefined

  const rename = useMutation({
    mutationFn: () => renameAccessToken(access.id, name.trim()),
    onSuccess: async (token) => {
      toast.success('Accès renommé')
      onRenamed(token.name)
      await queryClient.invalidateQueries({ queryKey: accessTokenKeys.all })
    },
    onError: (failure) => toast.error(accessTokenErrorMessage(failure)),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (error) return
    if (name.trim() === access.name) {
      onBack()
      return
    }
    rename.mutate()
  }

  return (
    <form noValidate onSubmit={submit}>
      <div className="flex min-h-14 items-center py-2 pr-12 pl-2">
        <Button type="button" ghost variant="secondary" onClick={onBack}>
          <ChevronLeftIcon aria-hidden />
          Retour
        </Button>
      </div>
      <SheetHeader className="pt-0">
        <SheetTitle>Renommer</SheetTitle>
        <SheetDescription>
          Un nom pour le reconnaître&nbsp;: «&nbsp;Claude Desktop&nbsp;»,
          «&nbsp;Claude Code&nbsp;», «&nbsp;Script d’export&nbsp;».
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6">
        <Field data-invalid={submitted && error !== undefined}>
          <FieldLabel htmlFor={`${id}-name`}>Nom</FieldLabel>
          <Input
            id={`${id}-name`}
            autoComplete="off"
            maxLength={NAME_MAX}
            value={name}
            aria-invalid={submitted && error !== undefined}
            onChange={(event) => setName(event.target.value)}
          />
          {submitted && error && <FieldError>{error}</FieldError>}
        </Field>
        <Button type="submit" className="w-full" loading={rename.isPending}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}
