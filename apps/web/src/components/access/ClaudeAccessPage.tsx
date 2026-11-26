import { Button, EmptyState, Skeleton } from '@capi/ui'
import { cn } from '@capi/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  BanIcon,
  BookOpenIcon,
  CheckIcon,
  ChevronRightIcon,
  KeyRoundIcon,
  LaptopIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TerminalIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  accessTokenErrorMessage,
  accessTokensQuery,
} from '#/components/access-tokens/queries'
import { grantsQuery } from '#/components/oauth/queries'
import { SETTINGS_TONES } from '#/components/settings/SettingsList'
import type { SettingsTone } from '#/components/settings/SettingsList'
import { AccessDetailSheet } from './AccessDetailSheet'
import { endLabel, lastUseLabel, SCOPE_LABELS } from './access-labels'
import { mergeAccesses } from './accesses'
import type { AccessItem } from './accesses'
import { ConnectorSheet } from './ConnectorSheet'
import { ConnectSheet } from './ConnectSheet'
import { SkillSheet } from './SkillSheet'
import type { TokenTarget } from './ConnectSheet'

/**
 * « Claude et accès » (#329, the owner's direction « A. Choix d’abord »):
 * what Claude can and can't do, « Connecter Claude » (this Mac,
 * the phone and claude.ai while remote access is on, the Capi Skill (#497),
 * a script), then every
 * access in one list.
 */
export function ClaudeAccessPage({ email }: { email: string }) {
  const tokens = useQuery(accessTokensQuery)
  const grants = useQuery(grantsQuery)
  const [connect, setConnect] = useState<TokenTarget | null>(null)
  const [connectorOpen, setConnectorOpen] = useState(false)
  const [skillOpen, setSkillOpen] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)

  // `null`: remote access is off on this server (the API answers 404).
  const remoteOn = grants.data != null
  const accesses = useMemo(
    () => mergeAccesses(tokens.data ?? [], grants.data, new Date()),
    [tokens.data, grants.data],
  )
  const opened = accesses.find((access) => access.key === openKey) ?? null

  return (
    <>
      <ClaudeCanDo />

      <section className="space-y-2" aria-labelledby="connect-claude">
        <h2
          id="connect-claude"
          className="text-muted-foreground px-1 text-sm font-medium"
        >
          Connecter Claude
        </h2>
        <ul className="bg-card divide-border divide-y overflow-hidden rounded-xl border">
          <RowButton
            icon={LaptopIcon}
            tone="primary"
            title="Claude sur ce Mac"
            state="Claude Desktop ou Claude Code"
            onClick={() => setConnect('mac')}
          />
          {remoteOn && (
            <RowButton
              icon={SmartphoneIcon}
              tone="info"
              title="Claude sur le téléphone et claude.ai"
              state="Un connecteur, validé sur cette page"
              onClick={() => setConnectorOpen(true)}
            />
          )}
          <RowButton
            icon={BookOpenIcon}
            tone="success"
            title="Le Skill Capi"
            state="Bilan du mois, relevés et placements, pas à pas"
            onClick={() => setSkillOpen(true)}
          />
        </ul>
        <Button
          type="button"
          ghost
          variant="secondary"
          className="w-full"
          iconStart={<TerminalIcon />}
          onClick={() => setConnect('script')}
        >
          Script ou autre outil
        </Button>
      </section>

      <section className="space-y-2" aria-labelledby="active-accesses">
        <h2
          id="active-accesses"
          className="text-muted-foreground px-1 text-sm font-medium"
        >
          Accès actifs
        </h2>
        {tokens.isPending ? (
          <Skeleton className="h-28 w-full rounded-xl" />
        ) : tokens.isError ? (
          <p className="text-destructive text-sm">
            {accessTokenErrorMessage(tokens.error)}
          </p>
        ) : accesses.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={<ShieldCheckIcon />}
            title="Aucun accès"
            description="Seul vous lisez vos finances. Connectez Claude pour lui poser vos questions."
          />
        ) : (
          <ul
            aria-label="Accès actifs"
            className="bg-card divide-border divide-y overflow-hidden rounded-xl border"
          >
            {accesses.map((access) => (
              <AccessRow
                key={access.key}
                access={access}
                onOpen={() => setOpenKey(access.key)}
              />
            ))}
          </ul>
        )}
      </section>

      <ConnectSheet
        target={connect}
        onClose={() => setConnect(null)}
        email={email}
        takenNames={(tokens.data ?? []).map((token) => token.name)}
      />
      <ConnectorSheet
        open={connectorOpen}
        onClose={() => setConnectorOpen(false)}
      />
      <SkillSheet open={skillOpen} onClose={() => setSkillOpen(false)} />
      <AccessDetailSheet access={opened} onClose={() => setOpenKey(null)} />
    </>
  )
}

/** The short « what Claude can and can't do » at the top. */
export function ClaudeCanDo() {
  return (
    <div className="bg-card space-y-2 rounded-xl border p-3 text-sm">
      <p className="font-medium">Ce que Claude peut faire</p>
      <p className="flex gap-2">
        <CheckIcon
          aria-hidden
          className="text-success mt-0.5 size-4 shrink-0"
        />
        <span>
          {
            'Lire vos comptes, opérations et budgets. Avec «\u00a0Lire et classer\u00a0», aussi classer et importer un relevé, toujours après votre accord.'
          }
        </span>
      </p>
      <p className="flex gap-2">
        <BanIcon
          aria-hidden
          className="text-muted-foreground mt-0.5 size-4 shrink-0"
        />
        <span className="text-muted-foreground">
          Jamais&nbsp;: supprimer, toucher à vos comptes ou à votre connexion,
          clôturer un mois.
        </span>
      </p>
    </div>
  )
}

const ROW =
  'flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] focus-visible:ring-inset transition-colors'

/** A settings-style row that opens a sheet. */
function RowButton({
  icon: Icon,
  tone,
  title,
  state,
  onClick,
}: {
  icon: LucideIcon
  tone: SettingsTone
  title: string
  state: ReactNode
  onClick: () => void
}) {
  return (
    <li>
      <button type="button" className={ROW} onClick={onClick}>
        <span
          aria-hidden
          className={cn(
            'flex size-[32px] shrink-0 items-center justify-center rounded-[8px] [&_svg]:size-[18px]',
            SETTINGS_TONES[tone],
          )}
        >
          <Icon />
        </span>
        <span className="block min-w-0 flex-1">
          <span className="block font-medium break-words">{title}</span>
          <span className="text-muted-foreground block text-xs text-pretty">
            {state}
          </span>
        </span>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </button>
    </li>
  )
}

function AccessRow({
  access,
  onOpen,
}: {
  access: AccessItem
  onOpen: () => void
}) {
  const now = new Date()
  const parts = [
    SCOPE_LABELS[access.scope],
    lastUseLabel(access.lastUsedAt, now),
    endLabel(access.expiresAt, access.expired),
  ]
  return (
    <RowButton
      icon={access.kind === 'app' ? SmartphoneIcon : KeyRoundIcon}
      tone={
        access.expired ? 'muted' : access.kind === 'app' ? 'info' : 'primary'
      }
      title={access.name}
      state={<StateParts parts={parts} danger={access.expired ? 2 : null} />}
      onClick={onOpen}
    />
  )
}

/** « Lire seulement · utilisé il y a 2 h · jusqu’au … », each part kept whole. */
function StateParts({
  parts,
  danger,
}: {
  parts: string[]
  /** Index of the part to show in red (an expired end). */
  danger: number | null
}) {
  return (
    <>
      {parts.map((part, index) => (
        <span key={part}>
          <span
            className={cn(
              'whitespace-nowrap',
              index === danger && 'text-destructive',
            )}
          >
            {part}
            {index < parts.length - 1 && '\u00a0·'}
          </span>
          {index < parts.length - 1 && ' '}
        </span>
      ))}
    </>
  )
}
