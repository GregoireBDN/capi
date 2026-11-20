import {
  Button,
  Card,
  CardContent,
  Field,
  FieldDescription,
  FieldLabel,
  ItemList,
  ItemListGroup,
  ItemListRow,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ChevronLeftIcon,
  CircleHelpIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  AnswerCryptoMovementDto,
  CryptoAnsweredItemDto,
  CryptoPendingItemDto,
} from '#/api/types.gen'
import { parseAmountToCents } from '#/components/accounts/amount'
import { AmountField } from '#/components/amount/AmountField'
import { LARGE_AMOUNT_CENTS } from '#/components/amount/signed-amount'
import { DashboardCardHeader } from '#/components/dashboard/DashboardCardHeader'
import {
  FORM_SHEET_FORM,
  FORM_SHEET_SIDE,
  FormSheetBody,
  FormSheetFooter,
  STEPPED_SHEET_BOTTOM,
} from '#/components/sheets/form-sheet'
import { plural } from '#/lib/plural'
import { ApiRequestError } from '#/lib/queries'
import {
  afterHoldingsChanged,
  answerMovement,
  clearAnswer,
  nameCounterpart,
  pendingQuery,
  unlinkMovement,
} from './queries'
import {
  answeredText,
  candidateText,
  coins,
  question,
  whenText,
} from './pending-text'

/** French message for a failed answer. */
function answerErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404) return 'Ce mouvement n’existe plus.'
  if (error.status === 409) return 'Ce mouvement est déjà relié à un autre.'
  if (error.status === 400) {
    return 'Réponse refusée : ces deux mouvements ne vont pas ensemble.'
  }
  return 'Une erreur est survenue. Réessayez.'
}

/** Everything that reads a cost: holdings, figures, the Crypto page. */
function refresh(queryClient: QueryClient) {
  return Promise.all([
    afterHoldingsChanged(queryClient),
    queryClient.invalidateQueries({ queryKey: ['investments'] }),
  ])
}

type Step = 'choice' | 'pick' | 'cost'

/** What a tap on an answer does, by the movement's type. */
interface Choice {
  label: string
  hint: string
  next: Step | AnswerCryptoMovementDto
}

function choices(item: CryptoPendingItemDto): Choice[] {
  const linkable = item.candidates.length > 0
  if (item.type === 'departure') {
    return [
      ...(linkable
        ? [
            {
              label: 'Vers une plateforme',
              hint: 'Ils sont arrivés sur un autre de vos comptes : leur coût les suit.',
              next: 'pick' as const,
            },
          ]
        : []),
      {
        label: 'Vendus ou donnés',
        hint: 'Ils sortent au prix de revient moyen.',
        next: { answer: 'disposed' },
      },
    ]
  }
  return [
    ...(linkable
      ? [
          {
            label: 'Depuis une plateforme',
            hint: 'Envoyés d’un autre de vos comptes : leur coût les suit.',
            next: 'pick' as const,
          },
        ]
      : []),
    {
      label: 'Achetés ailleurs',
      hint: 'Indiquez ce qu’ils vous ont coûté.',
      next: 'cost',
    },
    {
      label: 'Reçus gratuitement',
      hint: 'Un cadeau, un airdrop, des récompenses : coût 0 €.',
      next: { answer: 'gift' },
    },
  ]
}

/**
 * « À préciser » (#373): the coins of a crypto account that arrived from,
 * or left for, somewhere the app can't see, one row each; a tap opens the
 * answers. Answered ones stay listed, folded, each with « Annuler ». Hidden
 * when there is nothing to say.
 */
export function PendingCard({
  accountId,
  writable,
}: {
  accountId: string
  writable: boolean
}) {
  const pending = useQuery(pendingQuery(accountId))
  const queryClient = useQueryClient()
  const [openId, setOpenId] = useState<string | null>(null)
  const undo = useMutation({
    mutationFn: (item: CryptoAnsweredItemDto) =>
      item.answer === 'transfer'
        ? unlinkMovement(item.movementId)
        : clearAnswer(item.movementId),
    onSuccess: () => refresh(queryClient),
    onError: (error) => toast.error(answerErrorMessage(error)),
  })

  const data = pending.data
  if (!data || (data.items.length === 0 && data.answered.length === 0)) {
    return null
  }
  const open = data.items.find((item) => item.movementId === openId) ?? null

  return (
    <Card role="region" aria-label="À préciser" className="min-w-0">
      <DashboardCardHeader
        title="À préciser"
        status={
          data.items.length > 0
            ? `${plural(data.items.length, 'mouvement', 'mouvements')} dont l’app ne connaît pas l’origine : leur coût compte dès votre réponse.`
            : 'Tout est précisé.'
        }
      />
      <CardContent className="space-y-3">
        {data.items.length > 0 && (
          <ItemList>
            <ItemListGroup>
              {data.items.map((item) => (
                <ItemListRow
                  key={item.movementId}
                  asChild={writable}
                  icon={
                    item.type === 'departure' ? (
                      <ArrowUpRightIcon />
                    ) : item.type === 'arrival' ? (
                      <ArrowDownLeftIcon />
                    ) : (
                      <CircleHelpIcon />
                    )
                  }
                  iconClassName="bg-warning/15 text-warning-foreground dark:text-warning"
                  title={question(item)}
                  subtitle={whenText(item)}
                >
                  {writable ? (
                    <button
                      type="button"
                      className="w-full text-left"
                      aria-label={`${question(item)} ${whenText(item)}`}
                      onClick={() => setOpenId(item.movementId)}
                    />
                  ) : undefined}
                </ItemListRow>
              ))}
            </ItemListGroup>
          </ItemList>
        )}
        {data.answered.length > 0 && (
          <details className="group">
            <summary className="text-muted-foreground flex min-h-11 cursor-pointer items-center text-sm">
              Réponses données ({data.answered.length})
            </summary>
            <ul className="divide-y text-sm">
              {data.answered.map((item) => (
                <li
                  key={item.movementId}
                  className="flex min-h-11 flex-wrap items-center gap-x-2"
                >
                  <span className="min-w-[7rem] flex-1 break-normal">
                    {answeredText(item)}
                  </span>
                  {writable && (
                    <Button
                      size="sm"
                      variant="secondary"
                      ghost
                      className="ml-auto"
                      disabled={undo.isPending}
                      aria-label={`Annuler : ${answeredText(item)}`}
                      onClick={() => undo.mutate(item)}
                    >
                      Annuler
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
      {writable && (
        <AnswerSheet
          item={open}
          onOpenChange={(next) => {
            if (!next) setOpenId(null)
          }}
        />
      )}
    </Card>
  )
}

/** What was answered, as the toast says it. */
function savedText(item: CryptoPendingItemDto, body: AnswerCryptoMovementDto) {
  switch (body.answer) {
    case 'transfer':
      return item.type === 'departure'
        ? 'Départ relié à son arrivée'
        : 'Arrivée reliée à son envoi'
    case 'bought':
      return 'Prix de revient enregistré'
    case 'gift':
      return 'Reçus gratuitement : coût 0 €'
    case 'disposed':
      return 'Vendus ou donnés'
  }
}

/**
 * The answers to one movement, one decision per screen: what happened
 * (a tap moves on or saves), then the other side or the cost. Every answer
 * offers « Annuler » in its toast.
 */
function AnswerSheet({
  item,
  onOpenChange,
}: {
  item: CryptoPendingItemDto | null
  onOpenChange: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const id = useId()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('choice')
  const [amount, setAmount] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const open = item !== null

  useEffect(() => {
    if (!open) return
    setStep('choice')
    setAmount('')
  }, [open, item?.movementId])
  useEffect(() => {
    if (open) headingRef.current?.focus({ preventScroll: true })
  }, [open, step])

  const save = useMutation({
    mutationFn: (body: AnswerCryptoMovementDto) =>
      answerMovement(item!.movementId, body),
    onSuccess: async (_result, body) => {
      const answered = item!
      onOpenChange(false)
      toast.success(savedText(answered, body), {
        action: {
          label: 'Annuler',
          onClick: () => {
            const undo =
              body.answer !== 'transfer'
                ? clearAnswer(answered.movementId)
                : answered.type === 'opening'
                  ? nameCounterpart(body.counterpartMovementId!, null)
                  : unlinkMovement(answered.movementId)
            void undo
              .then(() => refresh(queryClient))
              .catch((error: unknown) => toast.error(answerErrorMessage(error)))
          },
        },
      })
      await refresh(queryClient)
    },
    onError: (error) => toast.error(answerErrorMessage(error)),
  })

  const cents = parseAmountToCents(amount)
  const title = item ? question(item) : 'À préciser'

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (step !== 'cost' || cents === null || save.isPending) return
    save.mutate({ answer: 'bought', costCents: cents })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? STEPPED_SHEET_BOTTOM : FORM_SHEET_SIDE}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          headingRef.current?.focus({ preventScroll: true })
        }}
      >
        <form noValidate onSubmit={submit} className={FORM_SHEET_FORM}>
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            {item ? whenText(item) : ''}
          </SheetDescription>
          <div className="flex min-h-14 shrink-0 items-center gap-1 py-2 pr-12 pl-2">
            {step !== 'choice' ? (
              <Button
                type="button"
                ghost
                variant="secondary"
                onClick={() => setStep('choice')}
              >
                <ChevronLeftIcon aria-hidden />
                Retour
              </Button>
            ) : (
              <span className="w-2" />
            )}
            <h3
              ref={headingRef}
              tabIndex={-1}
              className="min-w-0 flex-1 text-base font-semibold break-normal outline-none"
            >
              {step === 'pick'
                ? item?.type === 'departure'
                  ? 'Vers quel compte ?'
                  : 'Depuis quel envoi ?'
                : step === 'cost'
                  ? 'Prix de revient'
                  : title}
            </h3>
          </div>

          <FormSheetBody>
            {item && step === 'choice' && (
              <>
                <p className="text-muted-foreground text-sm">
                  {whenText(item)}.
                </p>
                <div className="space-y-2">
                  {choices(item).map((choice) => (
                    <Button
                      key={choice.label}
                      type="button"
                      variant="secondary"
                      outline
                      className="h-auto min-h-11 w-full flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
                      disabled={save.isPending}
                      onClick={() =>
                        typeof choice.next === 'string'
                          ? setStep(choice.next)
                          : save.mutate(choice.next)
                      }
                    >
                      <span className="font-medium">{choice.label}</span>
                      <span className="text-muted-foreground text-xs font-normal">
                        {choice.hint}
                      </span>
                    </Button>
                  ))}
                </div>
              </>
            )}
            {item && step === 'pick' && (
              <div className="space-y-2">
                {item.candidates.map((candidate) => (
                  <Button
                    key={candidate.movementId}
                    type="button"
                    variant="secondary"
                    outline
                    className="min-h-11 w-full justify-start text-left whitespace-normal"
                    disabled={save.isPending}
                    onClick={() =>
                      save.mutate({
                        answer: 'transfer',
                        counterpartMovementId: candidate.movementId,
                      })
                    }
                  >
                    {candidateText(candidate, item.symbol)}
                  </Button>
                ))}
              </div>
            )}
            {item && step === 'cost' && (
              <Field>
                <FieldLabel htmlFor={`${id}-cost`}>
                  Ce que vous ont coûté ces {coins(item)}
                </FieldLabel>
                <AmountField
                  id={`${id}-cost`}
                  maxCents={LARGE_AMOUNT_CENTS}
                  placeholder="1 000"
                  value={amount}
                  onValueChange={(typed) => setAmount(typed)}
                />
                <FieldDescription>
                  En euros, frais compris. Il compte dans « Investi » et le
                  résultat de ce compte.
                </FieldDescription>
              </Field>
            )}
          </FormSheetBody>

          {step === 'cost' && (
            <FormSheetFooter>
              <Button
                type="submit"
                className="min-h-11 flex-1 font-medium"
                disabled={cents === null}
                loading={save.isPending}
              >
                Enregistrer
              </Button>
            </FormSheetFooter>
          )}
        </form>
      </SheetContent>
    </Sheet>
  )
}
