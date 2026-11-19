import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Badge,
  Button,
  cn,
  Input,
  SegmentedControl,
  SegmentedControlItem,
} from '@finances/ui'
import {
  BanIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  LaptopIcon,
  PlusIcon,
  SmartphoneIcon,
  TerminalIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

/**
 * Prototypes of « Claude et accès » (#329), shown to the owner before one is
 * built in `apps/web`. Clickable mockups with synthetic data, not app code.
 *
 * Audit of the page before (390px):
 * - « Jetons d’accès » speaks the API's language: « jeton », « portée »,
 *   « fin_pat_AbCd… », « Derniers appels » as `GET /api/transactions/:id`;
 * - after « Créer le jeton » nothing says what to do with it: no Claude
 *   Desktop config, no `claude mcp add`, no API URL: the README has it;
 * - tokens and connected apps are two cards for one question, « qui peut
 *   lire mes finances ? ».
 *
 * Page
 * A. Choix d’abord : a short « Ce que Claude peut faire », then « Connecter
 *    Claude » as two choices (this Mac, the phone and claude.ai) and a
 *    quieter « Script ou autre outil », then one list « Accès actifs ».
 * B. Liste d’abord : the list first, one « Connecter Claude » button whose
 *    sheet starts with the choice.
 *
 * Connect (« une décision par écran », Étape n sur 3)
 * 1. « Que peut faire Claude ? » : « Lire seulement » / « Lire et classer »,
 *    a tap moves on;
 * 2. « Pour combien de temps ? » : 30 jours, 90 jours, 1 an, sans limite;
 * 3. « Collez cette configuration » : the token shown once, inside the
 *    ready-to-paste block. A. one block at a time (Claude Desktop | Claude
 *    Code); B. both blocks one under the other.
 *
 * An access opens its detail: what it may do, until when, its last calls in
 * plain words, « Renommer » and « Révoquer ».
 */
const meta: Meta = {
  title: 'Prototypes/Claude access (#329)',
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile' },
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

/* ---------------------------------------------------------------------------
 * Synthetic data
 * ------------------------------------------------------------------------- */

interface Access {
  id: string
  kind: 'token' | 'app'
  name: string
  write: boolean
  used: string
  ends: string
}

const ACCESSES: Access[] = [
  {
    id: 'a',
    kind: 'token',
    name: 'Claude sur ce Mac',
    write: true,
    used: 'utilisé il y a 2 h',
    ends: 'jusqu’au 17 févr. 2027',
  },
  {
    id: 'b',
    kind: 'app',
    name: 'Claude (claude.ai)',
    write: false,
    used: 'utilisé il y a 3 j',
    ends: 'à renouveler le 12 janv. 2027',
  },
  {
    id: 'c',
    kind: 'token',
    name: 'Script export',
    write: false,
    used: 'jamais utilisé',
    ends: 'sans limite',
  },
]

const CALLS = [
  { when: 'aujourd’hui 14:02', what: 'a classé 3 opérations', ok: true },
  { when: 'aujourd’hui 14:01', what: 'a lu les opérations à revoir', ok: true },
  { when: 'aujourd’hui 14:01', what: 'a lu la revue du mois', ok: true },
  { when: 'hier 21:40', what: 'a voulu supprimer une opération', ok: false },
  { when: 'hier 21:38', what: 'a lu le budget', ok: true },
]

const TOKEN = `fin_pat_${'x7Qp2'.repeat(8)}abc`
const API_URL = 'https://finances.tailnet.example'
const SERVER_PATH = '/Users/vous/finances/apps/mcp/dist/index.js'

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------- */

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-screen space-y-5 p-4">
      <div>
        <p className="text-muted-foreground text-sm">‹ Réglages</p>
        <h1 className="text-xl font-semibold">Claude et accès</h1>
      </div>
      {children}
    </div>
  )
}

function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      {label && (
        <h2 className="text-muted-foreground px-1 text-sm font-medium">
          {label}
        </h2>
      )}
      <ul className="bg-card divide-y overflow-hidden rounded-xl border">
        {children}
      </ul>
    </section>
  )
}

function Tile({
  icon,
  tone = 'bg-muted text-muted-foreground',
}: {
  icon: ReactNode
  tone?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-[32px] shrink-0 items-center justify-center rounded-[8px] [&_svg]:size-[18px]',
        tone,
      )}
    >
      {icon}
    </span>
  )
}

function Row({
  icon,
  tone,
  title,
  state,
  onClick,
}: {
  icon: ReactNode
  tone?: string
  title: string
  state?: ReactNode
  onClick?: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="hover:bg-muted/60 flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left text-sm"
      >
        <Tile icon={icon} tone={tone} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          {state && (
            <span className="text-muted-foreground block text-xs">{state}</span>
          )}
        </span>
        <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
      </button>
    </li>
  )
}

function CanDo() {
  return (
    <div className="bg-card space-y-2 rounded-xl border p-3 text-sm">
      <p className="font-medium">Ce que Claude peut faire</p>
      <p className="flex gap-2">
        <CheckIcon className="text-success mt-0.5 size-4 shrink-0" />
        <span>
          Lire vos comptes, opérations, budgets et prévisions. Avec « Lire et
          classer », aussi classer, noter, créer des règles, fixer des budgets
          et importer un relevé CIC, toujours après vous avoir montré l’aperçu.
        </span>
      </p>
      <p className="flex gap-2">
        <BanIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <span className="text-muted-foreground">
          Jamais : supprimer, toucher à vos comptes ou à votre connexion,
          clôturer un mois.
        </span>
      </p>
    </div>
  )
}

function AccessRows({ onOpen }: { onOpen: (access: Access) => void }) {
  return (
    <>
      {ACCESSES.map((access) => (
        <Row
          key={access.id}
          icon={access.kind === 'app' ? <SmartphoneIcon /> : <LaptopIcon />}
          tone={
            access.kind === 'app'
              ? 'bg-info/12 text-info'
              : 'bg-primary/12 text-primary'
          }
          title={access.name}
          state={`${access.write ? 'Lire et classer' : 'Lire seulement'} · ${access.used} · ${access.ends}`}
          onClick={() => onOpen(access)}
        />
      ))}
    </>
  )
}

/** A bottom sheet stand-in: the screen under it dimmed. */
function SheetFrame({
  onClose,
  children,
}: {
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button
        type="button"
        aria-label="Fermer"
        className="flex-1"
        onClick={onClose}
      />
      <div className="bg-background max-h-[92svh] overflow-y-auto rounded-t-xl pb-6">
        {children}
      </div>
    </div>
  )
}

function StepHeader({
  step,
  onBack,
  title,
}: {
  step?: number
  onBack?: () => void
  title: string
}) {
  return (
    <>
      <div className="flex min-h-14 items-center gap-2 px-2 py-2">
        {onBack ? (
          <Button ghost variant="secondary" onClick={onBack}>
            <ChevronLeftIcon />
            Retour
          </Button>
        ) : (
          <span className="w-2" />
        )}
        {step && (
          <p className="text-muted-foreground text-sm">Étape {step} sur 3</p>
        )}
      </div>
      <h3 className="px-4 pb-3 text-lg font-semibold">{title}</h3>
    </>
  )
}

function Choice({
  label,
  description,
  icon,
  onSelect,
}: {
  label: string
  description?: string
  icon?: ReactNode
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="hover:bg-muted/60 flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left"
      >
        {icon && <Tile icon={icon} />}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          {description && (
            <span className="text-muted-foreground block text-sm">
              {description}
            </span>
          )}
        </span>
        <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
      </button>
    </li>
  )
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <Button
          size="sm"
          variant="secondary"
          outline
          onClick={() => setCopied(true)}
          iconStart={copied ? <CheckIcon /> : <CopyIcon />}
        >
          {copied ? 'Copié' : 'Copier'}
        </Button>
      </div>
      <pre className="bg-muted overflow-x-auto rounded-lg p-3 font-mono text-xs leading-relaxed">
        {text}
      </pre>
    </div>
  )
}

const desktopConfig = `{
  "mcpServers": {
    "finances": {
      "command": "node",
      "args": ["${SERVER_PATH}"],
      "env": {
        "FINANCES_API_URL": "${API_URL}",
        "FINANCES_API_TOKEN": "${TOKEN}"
      }
    }
  }
}`

const codeCommand = `claude mcp add finances --scope user \\
  -e FINANCES_API_URL=${API_URL} \\
  -e FINANCES_API_TOKEN=${TOKEN} \\
  -- node ${SERVER_PATH}`

/* ---------------------------------------------------------------------------
 * The connect flow
 * ------------------------------------------------------------------------- */

type Target = 'mac' | 'phone' | 'script'
type Step = 'target' | 'scope' | 'duration' | 'setup'

function ConnectFlow({
  start,
  setup,
  initialStep,
  onClose,
}: {
  start: Target | null
  setup: 'tabs' | 'stacked'
  initialStep?: Step
  onClose: () => void
}) {
  const [target, setTarget] = useState<Target | null>(start)
  const [step, setStep] = useState<Step>(
    initialStep ?? (start ? 'scope' : 'target'),
  )
  const [client, setClient] = useState<'desktop' | 'code'>('desktop')

  if (target === 'phone' && step !== 'target') {
    return (
      <SheetFrame onClose={onClose}>
        <StepHeader
          title="Ajoutez Finances comme connecteur"
          onBack={start ? undefined : () => setStep('target')}
        />
        <div className="space-y-4 px-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Dans claude.ai ou l’app Claude : Paramètres › Connecteurs › «
              Ajouter un connecteur personnalisé ».
            </li>
            <li>Collez cette adresse :</li>
          </ol>
          <CopyBlock label="Adresse du connecteur" text={`${API_URL}/mcp`} />
          <p className="text-muted-foreground text-sm">
            Claude ouvre ensuite cette app : vous validerez l’accès sur cette
            page, en lecture seule ou avec le droit de classer.
          </p>
          <Button className="w-full" onClick={onClose}>
            Terminé
          </Button>
        </div>
      </SheetFrame>
    )
  }

  return (
    <SheetFrame onClose={onClose}>
      {step === 'target' && (
        <>
          <StepHeader title="Que voulez-vous connecter ?" />
          <ul className="space-y-2 px-4">
            <Choice
              icon={<LaptopIcon />}
              label="Claude sur ce Mac"
              description="Claude Desktop ou Claude Code"
              onSelect={() => {
                setTarget('mac')
                setStep('scope')
              }}
            />
            <Choice
              icon={<SmartphoneIcon />}
              label="Claude sur le téléphone et claude.ai"
              description="Un connecteur, validé sur cette page"
              onSelect={() => {
                setTarget('phone')
                setStep('scope')
              }}
            />
            <Choice
              icon={<TerminalIcon />}
              label="Script ou autre outil"
              onSelect={() => {
                setTarget('script')
                setStep('scope')
              }}
            />
          </ul>
        </>
      )}
      {step === 'scope' && (
        <>
          <StepHeader
            step={1}
            title="Que peut faire Claude ?"
            onBack={start ? undefined : () => setStep('target')}
          />
          <ul className="space-y-2 px-4">
            <Choice
              label="Lire seulement"
              description="Répondre à vos questions sur vos comptes, opérations, budgets et prévisions."
              onSelect={() => setStep('duration')}
            />
            <Choice
              label="Lire et classer"
              description="Aussi classer des opérations, ajouter des notes et des règles, fixer des budgets, importer un relevé CIC. Toujours après votre accord, jamais de suppression."
              onSelect={() => setStep('duration')}
            />
          </ul>
        </>
      )}
      {step === 'duration' && (
        <>
          <StepHeader
            step={2}
            title="Pour combien de temps ?"
            onBack={() => setStep('scope')}
          />
          <ul className="space-y-2 px-4">
            {['30 jours', '90 jours', '1 an', 'Sans limite'].map((label) => (
              <Choice
                key={label}
                label={label}
                onSelect={() => setStep('setup')}
              />
            ))}
          </ul>
          <p className="text-muted-foreground px-4 pt-3 text-sm">
            Vous pourrez le révoquer à tout moment.
          </p>
        </>
      )}
      {step === 'setup' && (
        <>
          <StepHeader
            step={3}
            title={
              target === 'script'
                ? 'Votre clé d’accès'
                : 'Collez cette configuration'
            }
          />
          <div className="space-y-4 px-4">
            <p className="bg-warning/12 rounded-lg p-3 text-sm">
              La clé n’est affichée qu’une fois : copiez-la maintenant. Elle
              donne accès à vos finances, gardez-la hors de tout dépôt.
            </p>
            {target === 'script' ? (
              <>
                <CopyBlock label="Clé d’accès" text={TOKEN} />
                <CopyBlock
                  label="Exemple"
                  text={`curl -H "Authorization: Bearer ${TOKEN}" \\\n  ${API_URL}/api/accounts`}
                />
              </>
            ) : setup === 'tabs' ? (
              <>
                <SegmentedControl
                  value={client}
                  onValueChange={setClient}
                  fullWidth
                  aria-label="Application"
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
                      Claude Desktop › Réglages › Développeur › « Modifier la
                      configuration », collez, puis redémarrez Claude.
                    </p>
                    <CopyBlock
                      label="claude_desktop_config.json"
                      text={desktopConfig}
                    />
                  </>
                ) : (
                  <>
                    <p className="text-sm">Dans un terminal :</p>
                    <CopyBlock label="Commande" text={codeCommand} />
                  </>
                )}
              </>
            ) : (
              <>
                <CopyBlock
                  label="Claude Desktop · claude_desktop_config.json"
                  text={desktopConfig}
                />
                <CopyBlock label="Claude Code · terminal" text={codeCommand} />
              </>
            )}
            <details className="rounded-lg border text-sm">
              <summary className="flex min-h-11 items-center px-3">
                Chemin du serveur sur ce Mac
              </summary>
              <div className="space-y-2 border-t p-3">
                <Input defaultValue={SERVER_PATH} className="font-mono" />
                <p className="text-muted-foreground text-xs">
                  Retenu sur cet appareil. Dans le dossier du projet :{' '}
                  <code>pnpm --filter @finances/mcp build</code>.
                </p>
              </div>
            </details>
            <Button className="w-full" onClick={onClose}>
              Terminé
            </Button>
          </div>
        </>
      )}
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * The detail of an access
 * ------------------------------------------------------------------------- */

function Detail({ access, onClose }: { access: Access; onClose: () => void }) {
  return (
    <SheetFrame onClose={onClose}>
      <StepHeader title={access.name} />
      <div className="space-y-4 px-4">
        <ul className="bg-card divide-y rounded-xl border text-sm">
          <li className="flex min-h-11 items-center justify-between gap-3 px-3">
            <span className="text-muted-foreground">Peut</span>
            <span>{access.write ? 'Lire et classer' : 'Lire seulement'}</span>
          </li>
          <li className="flex min-h-11 items-center justify-between gap-3 px-3">
            <span className="text-muted-foreground">Dernière utilisation</span>
            <span>{access.used.replace('utilisé ', '')}</span>
          </li>
          <li className="flex min-h-11 items-center justify-between gap-3 px-3">
            <span className="text-muted-foreground">Fin</span>
            <span>{access.ends}</span>
          </li>
        </ul>
        <section className="space-y-2">
          <h4 className="text-sm font-medium">Ce qu’il a fait</h4>
          <ul className="bg-card divide-y rounded-xl border text-sm">
            {CALLS.map((call) => (
              <li
                key={call.when + call.what}
                className="flex flex-wrap items-center gap-x-2 px-3 py-2"
              >
                <span className="min-w-0 flex-1">{call.what}</span>
                {!call.ok && (
                  <Badge variant="danger" outline>
                    Refusé
                  </Badge>
                )}
                <span className="text-muted-foreground text-xs">
                  {call.when}
                </span>
              </li>
            ))}
          </ul>
        </section>
        {access.kind === 'token' && (
          <Button variant="secondary" outline className="w-full">
            Renommer
          </Button>
        )}
        <Button variant="danger" outline className="w-full">
          {access.kind === 'app' ? 'Déconnecter' : 'Révoquer'}
        </Button>
      </div>
    </SheetFrame>
  )
}

/* ---------------------------------------------------------------------------
 * A. Choix d’abord
 * ------------------------------------------------------------------------- */

function DirectionA({ setup }: { setup: 'tabs' | 'stacked' }) {
  const [connect, setConnect] = useState<Target | null>(null)
  const [open, setOpen] = useState<Access | null>(null)
  return (
    <Screen>
      <CanDo />
      <Group label="Connecter Claude">
        <Row
          icon={<LaptopIcon />}
          tone="bg-primary/12 text-primary"
          title="Claude sur ce Mac"
          state="Claude Desktop ou Claude Code"
          onClick={() => setConnect('mac')}
        />
        <Row
          icon={<SmartphoneIcon />}
          tone="bg-info/12 text-info"
          title="Claude sur le téléphone et claude.ai"
          state="Un connecteur, validé sur cette page"
          onClick={() => setConnect('phone')}
        />
      </Group>
      <Button
        ghost
        variant="secondary"
        className="w-full"
        iconStart={<TerminalIcon />}
        onClick={() => setConnect('script')}
      >
        Script ou autre outil
      </Button>
      <Group label="Accès actifs">
        <AccessRows onOpen={setOpen} />
      </Group>
      {connect && (
        <ConnectFlow
          start={connect}
          setup={setup}
          onClose={() => setConnect(null)}
        />
      )}
      {open && <Detail access={open} onClose={() => setOpen(null)} />}
    </Screen>
  )
}

/* ---------------------------------------------------------------------------
 * B. Liste d’abord
 * ------------------------------------------------------------------------- */

function DirectionB() {
  const [connect, setConnect] = useState(false)
  const [open, setOpen] = useState<Access | null>(null)
  return (
    <Screen>
      <Group label="Accès actifs">
        <AccessRows onOpen={setOpen} />
      </Group>
      <Button
        className="w-full"
        iconStart={<PlusIcon />}
        onClick={() => setConnect(true)}
      >
        Connecter Claude
      </Button>
      <CanDo />
      {connect && (
        <ConnectFlow
          start={null}
          setup="stacked"
          onClose={() => setConnect(false)}
        />
      )}
      {open && <Detail access={open} onClose={() => setOpen(null)} />}
    </Screen>
  )
}

export const ChoixDabord: StoryObj = {
  name: 'A. Choix d’abord (setup en onglets)',
  render: () => <DirectionA setup="tabs" />,
}

export const ChoixDabordEmpile: StoryObj = {
  name: 'A′. Choix d’abord (setup empilé)',
  render: () => <DirectionA setup="stacked" />,
}

export const ListeDabord: StoryObj = {
  name: 'B. Liste d’abord',
  render: () => <DirectionB />,
}

export const Installation: StoryObj = {
  name: 'Étape 3 : la configuration à coller',
  render: function Render() {
    return (
      <Screen>
        <ConnectFlow
          start="mac"
          setup="tabs"
          initialStep="setup"
          onClose={() => undefined}
        />
      </Screen>
    )
  },
}

export const DetailDunAcces: StoryObj = {
  name: 'Détail d’un accès',
  render: () => (
    <Screen>
      <Detail access={ACCESSES[0]} onClose={() => undefined} />
    </Screen>
  ),
}
