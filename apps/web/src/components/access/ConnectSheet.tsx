import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  SegmentedControl,
  SegmentedControlItem,
} from '@capi/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClockIcon, KeyRoundIcon, PlugIcon, ShieldIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { AccessTokenScope, CreatedAccessTokenDto } from '#/api/types.gen'
import {
  accessTokenErrorMessage,
  accessTokenKeys,
  createAccessToken,
} from '#/components/access-tokens/queries'
import { ReauthSheet } from '#/components/auth/ReauthSheet'
import { needsReauth } from '#/lib/reauth'
import { SCOPE_DESCRIPTIONS, SCOPE_LABELS } from './access-labels'
import { CopyBlock } from './CopyBlock'
import {
  claudeCodeCommand,
  desktopConfig,
  loadServerPath,
  saveServerPath,
  scriptExample,
  SERVER_PATH_PLACEHOLDER,
  uniqueName,
} from './mcp-setup'
import { ChoiceTile, StepDialog } from './StepDialog'

/** What gets a token: Claude on this Mac (local MCP), or a script. */
export type TokenTarget = 'mac' | 'script'

const NAMES: Record<TokenTarget, string> = {
  mac: 'Claude sur Mac',
  script: 'Script',
}

/** Durations, in days; `null` = no end. */
const DURATIONS: { days: number | null; label: string }[] = [
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
  { days: 365, label: '1 an' },
  { days: null, label: 'Sans limite' },
]

type Step = 'scope' | 'duration' | 'setup'
const STEP_NUMBER: Record<Step, number> = { scope: 1, duration: 2, setup: 3 }

/**
 * « Connecter Claude » for the Mac or a script (#329), one decision per
 * screen: what it may do, for how long, then the ready-to-paste setup with
 * the token in it. The token is shown once: it lives in this component's
 * state only and is forgotten when the sheet closes. Creating it needs a
 * fresh session: `ReauthSheet` opens over the flow and the creation resumes.
 */
export function ConnectSheet({
  target,
  onClose,
  email,
  takenNames,
}: {
  /** The target being connected; `null` when closed. */
  target: TokenTarget | null
  onClose: () => void
  /** The owner's email, for the re-authentication. */
  email: string
  /** Names of the active tokens, so the new one gets its own. */
  takenNames: readonly string[]
}) {
  const queryClient = useQueryClient()
  const open = target !== null
  const [shown, setShown] = useState<TokenTarget>('mac')
  const [step, setStep] = useState<Step>('scope')
  const [scope, setScope] = useState<AccessTokenScope>('read')
  const [created, setCreated] = useState<CreatedAccessTokenDto | null>(null)
  const [reauthOpen, setReauthOpen] = useState(false)
  const [pendingDays, setPendingDays] = useState<number | null>(null)

  // A fresh flow on every opening; the token is dropped on close.
  useEffect(() => {
    if (target === null) {
      setCreated(null)
      return
    }
    setShown(target)
    setStep('scope')
    setScope('read')
    setCreated(null)
    setReauthOpen(false)
  }, [target])

  const create = useMutation({
    mutationFn: (days: number | null) =>
      createAccessToken({
        name: uniqueName(NAMES[shown], takenNames),
        scope,
        expiresInDays: days,
      }),
    onSuccess: async (token) => {
      setCreated(token)
      setStep('setup')
      await queryClient.invalidateQueries({ queryKey: accessTokenKeys.all })
    },
    onError: (error, days) => {
      if (needsReauth(error)) {
        setPendingDays(days)
        setReauthOpen(true)
      } else toast.error(accessTokenErrorMessage(error))
    },
  })

  const title =
    step === 'scope'
      ? 'Que peut faire Claude ?'
      : step === 'duration'
        ? 'Pour combien de temps ?'
        : shown === 'mac'
          ? 'Collez cette configuration'
          : 'Votre clé d’accès'

  return (
    <>
      <StepDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
        label={
          shown === 'mac'
            ? 'Connecter Claude sur ce Mac'
            : 'Connecter un script'
        }
        description="Ce que l’accès permet, sa durée, puis la configuration à coller."
        title={title}
        step={[STEP_NUMBER[step], 3]}
        onBack={step === 'duration' ? () => setStep('scope') : undefined}
        next={
          step === 'scope' ? { onSelect: () => setStep('duration') } : undefined
        }
        steps={{
          current: step,
          // Back to « Accès » from the duration; the token, once shown,
          // is not left.
          onSelect: step === 'duration' ? () => setStep('scope') : undefined,
          steps: [
            { key: 'scope', label: 'Accès', icon: <ShieldIcon aria-hidden /> },
            {
              key: 'duration',
              label: 'Durée',
              icon: <ClockIcon aria-hidden />,
              disabled: step === 'scope',
            },
            {
              key: 'setup',
              label: 'Installer',
              icon: <PlugIcon aria-hidden />,
              disabled: step !== 'setup',
            },
          ],
        }}
        action={
          step === 'setup' ? (
            <Button
              type="button"
              className="min-h-11 flex-1 font-medium"
              onClick={onClose}
            >
              Terminé
            </Button>
          ) : undefined
        }
      >
        {step === 'scope' && (
          <ul className="space-y-2">
            {(['read', 'write'] as const).map((value) => (
              <ChoiceTile
                key={value}
                label={SCOPE_LABELS[value]}
                description={SCOPE_DESCRIPTIONS[value]}
                selected={scope === value}
                onSelect={() => {
                  setScope(value)
                  setStep('duration')
                }}
              />
            ))}
          </ul>
        )}
        {step === 'duration' && (
          <>
            <ul className="space-y-2">
              {DURATIONS.map((duration) => (
                <ChoiceTile
                  key={duration.label}
                  label={duration.label}
                  disabled={create.isPending}
                  onSelect={() => create.mutate(duration.days)}
                />
              ))}
            </ul>
            <p
              className="text-muted-foreground pt-3 text-sm"
              aria-live="polite"
            >
              {create.isPending
                ? 'Création de l’accès…'
                : 'Vous pourrez le révoquer à tout moment.'}
            </p>
          </>
        )}
        {step === 'setup' && created && (
          <Setup target={shown} token={created.token} />
        )}
      </StepDialog>
      <ReauthSheet
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        email={email}
        purpose="connecter Claude"
        continueLabel="Créer l’accès"
        continueDescription="Vous pouvez maintenant créer l’accès."
        onContinue={() => {
          setReauthOpen(false)
          create.mutate(pendingDays)
        }}
      />
    </>
  )
}

type Client = 'desktop' | 'code'

/** Step 3: the token once, inside the blocks to paste. */
function Setup({ target, token }: { target: TokenTarget; token: string }) {
  const id = useId()
  const [client, setClient] = useState<Client>('desktop')
  const [serverPath, setServerPath] = useState('')
  const [pathOpen, setPathOpen] = useState(false)
  // The app's own origin: the web server forwards `/api/*` with the token.
  const apiUrl = typeof window === 'undefined' ? '' : window.location.origin

  useEffect(() => {
    const saved = loadServerPath()
    setServerPath(saved)
    setPathOpen(saved === '')
  }, [])

  const setup = {
    apiUrl,
    token,
    serverPath: serverPath.trim() || SERVER_PATH_PLACEHOLDER,
  }

  return (
    <div className="space-y-4">
      <Alert variant="warning">
        <KeyRoundIcon />
        <AlertDescription>
          La clé n’est affichée qu’une fois&nbsp;: copiez-la maintenant. Elle
          donne accès à vos finances, gardez-la hors de tout dépôt.
        </AlertDescription>
      </Alert>

      {target === 'script' ? (
        <>
          <CopyBlock
            label="Clé d’accès"
            text={token}
            copiedMessage="Clé copiée"
          />
          <CopyBlock label="Exemple" text={scriptExample(setup)} />
        </>
      ) : (
        <>
          <details
            open={pathOpen}
            onToggle={(event) => setPathOpen(event.currentTarget.open)}
            className="rounded-lg border"
          >
            <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">
              {serverPath.trim()
                ? 'Chemin du serveur sur ce Mac'
                : 'Où est le serveur sur ce Mac ?'}
            </summary>
            <div className="border-t p-3">
              <Field>
                <FieldLabel htmlFor={`${id}-path`}>
                  Chemin de apps/mcp/dist/index.js
                </FieldLabel>
                <Input
                  id={`${id}-path`}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="font-mono"
                  placeholder={SERVER_PATH_PLACEHOLDER}
                  value={serverPath}
                  onChange={(event) => setServerPath(event.target.value)}
                  onBlur={() => saveServerPath(serverPath.trim())}
                />
                <FieldDescription>
                  Retenu sur cet appareil. Dans le dossier du projet&nbsp;:{' '}
                  <code className="font-mono">
                    pnpm --filter @capi/mcp build
                  </code>
                  , puis{' '}
                  <code className="font-mono">
                    echo $PWD/apps/mcp/dist/index.js
                  </code>
                  .
                </FieldDescription>
              </Field>
            </div>
          </details>

          <SegmentedControl
            value={client}
            onValueChange={setClient}
            fullWidth
            aria-label="Application Claude"
          >
            <SegmentedControlItem value="desktop">
              Claude Desktop
            </SegmentedControlItem>
            <SegmentedControlItem value="code">
              Claude Code
            </SegmentedControlItem>
          </SegmentedControl>

          {client === 'desktop' ? (
            <>
              <p className="text-sm">
                Dans Claude Desktop&nbsp;: Réglages › Développeur ›
                «&nbsp;Modifier la configuration&nbsp;». Collez ce bloc,
                enregistrez, puis quittez et rouvrez Claude.
              </p>
              <CopyBlock
                label="claude_desktop_config.json"
                text={desktopConfig(setup)}
                copiedMessage="Configuration copiée"
              />
              <p className="text-muted-foreground text-xs">
                D’autres serveurs y sont déjà&nbsp;? Ajoutez seulement
                «&nbsp;finances&nbsp;» à leur liste «&nbsp;mcpServers&nbsp;».
              </p>
            </>
          ) : (
            <>
              <p className="text-sm">
                Dans un terminal, puis vérifiez avec{' '}
                <code className="font-mono">claude mcp list</code> :
              </p>
              <CopyBlock
                label="Commande"
                text={claudeCodeCommand(setup)}
                copiedMessage="Commande copiée"
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
