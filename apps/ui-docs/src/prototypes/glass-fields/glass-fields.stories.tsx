import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  LandmarkIcon,
  PiggyBankIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  TagIcon,
  XIcon,
  ZapIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * #507 prototypes: the fields in glass (recipe « A · Givré », #503). One
 * phone each: the Opérations toolbar on the page (search, a chosen filter,
 * « Exceptionnelles ») and a form in a sheet (focused, invalid, disabled,
 * select, date, note, switch, check box, radio).
 *
 * - Aujourd'hui: 1px border, 3px ring on focus.
 * - A · Relief: the recipe's well (card, sheen, soft shadow), a primary glow.
 * - B · Creusé: a faint hollow (glass fill, inner shadow), white on focus.
 * - C · Pilule: A's well, fully rounded.
 *
 * Deleted by the PR that builds the chosen one (#351).
 */
const meta: Meta = {
  title: 'Prototypes/Champs en verre (#507)',
  parameters: { layout: 'fullscreen' },
  tags: ['!autodocs'],
}

export default meta

type Story = StoryObj

type Variant = 'now' | 'a' | 'b' | 'c'

const CSS = `
.pf { --pf-r: var(--radius-lg); }
.pf[data-v=a], .pf[data-v=b] { --pf-r: var(--radius-control); }
.pf[data-v=c] { --pf-r: 999px; }

.pf-well {
  position: relative; display: flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 12px; font-size: 16px;
  border-radius: var(--pf-r);
  transition: box-shadow .15s, background-color .15s;
}
.pf-well[data-multi] { align-items: flex-start; padding-top: 10px; min-height: 88px; }
.pf[data-v=c] .pf-well[data-multi] { border-radius: 1.2rem; }

/* Today */
.pf[data-v=now] .pf-well { border: 1px solid var(--input); background: transparent; }
.dark .pf[data-v=now] .pf-well { background: oklch(from var(--input) l c h / 30%); }
.pf[data-v=now] .pf-well[data-s=focus] { border-color: var(--ring); box-shadow: 0 0 0 3px oklch(from var(--ring) l c h / 50%); }
.pf[data-v=now] .pf-well[data-s=invalid] { border-color: var(--destructive); box-shadow: 0 0 0 3px oklch(from var(--destructive) l c h / 20%); }
.pf[data-v=now] .pf-well[data-s=disabled] { opacity: .5; background: oklch(from var(--input) l c h / 50%); }
.pf[data-v=now] .pf-tb { background: var(--card); box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }

/* A and C: the recipe's well */
.pf[data-v=a] .pf-well, .pf[data-v=c] .pf-well {
  background: var(--card); box-shadow: var(--glass-edge), var(--glass-shadow-sm);
}
/* Dark: a slightly lighter fill, the shadow alone doesn't show */
.dark .pf[data-v=a] .pf-well, .dark .pf[data-v=c] .pf-well { background: color-mix(in oklch, var(--foreground) 7%, var(--card)); }
/* B: a faint hollow */
.pf[data-v=b] .pf-well {
  background: var(--glass-fill);
  box-shadow: inset 0 1px 2px rgb(15 23 42 / 10%);
}
.dark .pf[data-v=b] .pf-well { box-shadow: inset 0 1px 2px rgb(0 0 0 / 45%); }

/* Glass focus and invalid: a 1.5px edge and a soft glow, no layout change */
.pf:not([data-v=now]) .pf-well[data-s=focus] {
  background: var(--card);
  box-shadow: var(--glass-edge), 0 0 0 1.5px var(--primary), 0 0 0 5px oklch(from var(--primary) l c h / 16%);
}
.pf:not([data-v=now]) .pf-well[data-s=invalid] {
  background: color-mix(in oklch, var(--destructive) 5%, var(--card));
  box-shadow: var(--glass-edge), 0 0 0 1.5px var(--destructive), 0 0 0 5px oklch(from var(--destructive) l c h / 12%);
}
.pf:not([data-v=now]) .pf-well[data-s=disabled] {
  background: var(--glass-fill); box-shadow: none; opacity: .55;
}

/* A chosen filter, tinted by its value */
.pf[data-v] .pf-well[data-on] { background: color-mix(in oklch, var(--pf-tint) 13%, var(--card)); }
.pf[data-v=now] .pf-well[data-on] { border-color: color-mix(in oklch, var(--pf-tint) 60%, transparent); }

/* Check box, radio, switch */
.pf-box { display: grid; place-items: center; width: 22px; height: 22px; flex: none; }
.pf-box[data-round] { border-radius: 999px; }
.pf[data-v=now] .pf-box { border: 1px solid var(--input); border-radius: 5px; }
.pf[data-v=now] .pf-box[data-round] { border-radius: 999px; }
.pf:not([data-v=now]) .pf-box { border-radius: 7px; background: var(--card); box-shadow: var(--glass-edge), var(--glass-shadow-sm), inset 0 0 0 1.5px oklch(from var(--foreground) l c h / 22%); }
.pf[data-v=b] .pf-box { background: var(--glass-fill); box-shadow: inset 0 1px 2px rgb(15 23 42 / 12%), inset 0 0 0 1.5px oklch(from var(--foreground) l c h / 22%); }
.pf:not([data-v=now]) .pf-box[data-round] { border-radius: 999px; }
.pf .pf-box[data-on] { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }
.pf:not([data-v=now]) .pf-box[data-on] { box-shadow: var(--glass-edge), var(--glass-shadow-primary); }

.pf-sw { position: relative; width: 44px; height: 26px; border-radius: 999px; flex: none; }
.pf-sw > i { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 999px; }
.pf-sw[data-on] > i { left: 21px; }
.pf[data-v=now] .pf-sw { background: var(--input); }
.pf[data-v=now] .pf-sw > i { background: var(--background); box-shadow: 0 2px 4px rgb(0 0 0 / 15%); }
.pf:not([data-v=now]) .pf-sw { background: oklch(from var(--foreground) l c h / 14%); box-shadow: inset 0 1px 2px rgb(15 23 42 / 14%); }
.pf:not([data-v=now]) .pf-sw > i { background: white; box-shadow: 0 1px 3px rgb(15 23 42 / 30%), 0 0 0 .5px rgb(15 23 42 / 8%); }
.pf .pf-sw[data-on] { background: var(--primary); }
.pf:not([data-v=now]) .pf-sw[data-on] { box-shadow: var(--glass-shadow-primary); }
`

/* ------------------------------------------------------------- pieces */

function Well({
  state,
  multi,
  on,
  tint,
  children,
  className = '',
}: {
  state?: 'focus' | 'invalid' | 'disabled'
  multi?: boolean
  on?: boolean
  tint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`pf-well ${className}`}
      data-s={state}
      data-multi={multi || undefined}
      data-on={on || undefined}
      style={tint ? ({ '--pf-tint': tint } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 text-[14px] font-medium">{children}</div>
}

function Field({
  label,
  children,
  error,
}: {
  label: string
  children: ReactNode
  error?: string
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {error && (
        <div className="text-destructive mt-1.5 flex items-center gap-1.5 text-[14px] font-medium">
          <CircleAlertIcon className="size-[16px]" />
          {error}
        </div>
      )}
    </div>
  )
}

const muted = 'text-muted-foreground'

/** The Opérations toolbar on the page. */
function Toolbar({ v }: { v: Variant }) {
  return (
    <div className="space-y-3 px-4 pt-4 pb-5">
      <Well className="pf-tb pr-1">
        <SearchIcon className={`${muted} size-[18px] shrink-0`} />
        <span className={`${muted} min-w-0 flex-1 truncate`}>
          Rechercher un libellé…
        </span>
        {v === 'now' ? (
          <span className="bg-border h-6 w-px shrink-0" />
        ) : null}
        <span
          className={
            v === 'now'
              ? 'flex h-[38px] items-center gap-1.5 px-2 text-[15px] font-medium'
              : 'bg-glass-fill flex h-[36px] items-center gap-1.5 rounded-full px-3 text-[15px] font-medium'
          }
        >
          <SlidersHorizontalIcon className="size-[18px]" />
          Filtres
          <span className="bg-primary text-primary-foreground grid size-[22px] place-items-center rounded-full text-[12px] font-semibold">
            2
          </span>
        </span>
      </Well>
      {v === 'now' ? (
        <div className="relative mt-5">
          <span className="bg-background text-muted-foreground absolute -top-[0.55em] left-2 z-10 rounded-sm px-1 text-[12px] leading-none font-medium">
            Compte
          </span>
          <Well on tint="#16a34a" className="pr-1 pl-2">
            <PiggyBankIcon className="size-[17px] text-[#16a34a]" />
            <span className="flex-1 text-[14px] font-semibold">Livret A</span>
            <XIcon className="m-1.5 size-[15px]" />
          </Well>
        </div>
      ) : (
        <Well on tint="#16a34a" className="pr-1 pl-3">
          <PiggyBankIcon className="size-[18px] text-[#16a34a]" />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className={`${muted} text-[12px] font-medium`}>Compte</span>
            <span className="text-[15px] font-semibold">Livret A</span>
          </span>
          <span className="grid size-[36px] place-items-center rounded-full">
            <XIcon className="size-[16px]" />
          </span>
        </Well>
      )}
      <Well on tint="var(--primary)" className="pl-3">
        <span className="pf-box" data-on>
          <CheckIcon className="size-[14px]" strokeWidth={3} />
        </span>
        <ZapIcon className={`${muted} size-[17px]`} />
        <span className="text-[15px] font-semibold">Exceptionnelles</span>
      </Well>
    </div>
  )
}

/** A form in a sheet. */
function Form() {
  return (
    <div className="glass-panel rounded-t-[1.4rem] px-4 pt-3 pb-6">
      <div className="bg-foreground/15 mx-auto mb-3 h-1 w-10 rounded-full" />
      <div className="mb-4 text-[18px] font-semibold">Nouvelle opération</div>
      <div className="space-y-4">
        <Field label="Libellé">
          <Well state="focus">
            <span>Boulangerie test</span>
            <span className="bg-primary -ml-1.5 h-5 w-px" />
          </Well>
        </Field>
        <Field label="Montant" error="Montant requis">
          <Well state="invalid">
            <span className={`${muted} flex-1`}>0,00</span>
            <span className={muted}>€</span>
            <CircleAlertIcon className="text-destructive size-[18px]" />
          </Well>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Well>
              <span className="flex-1">26/11/2026</span>
              <CalendarIcon className={`${muted} size-[17px]`} />
            </Well>
          </Field>
          <Field label="Catégorie">
            <Well>
              <TagIcon className={`${muted} size-[17px]`} />
              <span className={`${muted} flex-1`}>Choisir</span>
              <ChevronDownIcon className={`${muted} size-[17px]`} />
            </Well>
          </Field>
        </div>
        <Field label="Compte">
          <Well state="disabled">
            <LandmarkIcon className="size-[17px]" />
            <span className="flex-1">Compte courant</span>
          </Well>
        </Field>
        <Field label="Note">
          <Well multi>
            <span className={muted}>Facultatif</span>
          </Well>
        </Field>
        <div className="flex items-center gap-3 pt-1">
          <span className="flex-1 text-[15px] font-medium">
            Toujours compenser
          </span>
          <span className="pf-sw" data-on>
            <i />
          </span>
          <span className="pf-sw">
            <i />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[15px]">
          <span className="flex items-center gap-2.5">
            <span className="pf-box" data-on>
              <CheckIcon className="size-[14px]" strokeWidth={3} />
            </span>
            Exceptionnelle
          </span>
          <span className="flex items-center gap-2.5">
            <span className="pf-box" />
            Partagée
          </span>
          <span className="flex items-center gap-2.5">
            <span className="pf-box" data-round data-on>
              <span className="bg-primary-foreground size-2 rounded-full" />
            </span>
            Dépense
          </span>
          <span className="flex items-center gap-2.5">
            <span className="pf-box" data-round />
            Revenu
          </span>
        </div>
      </div>
    </div>
  )
}

const TITLES: Record<Variant, string> = {
  now: "Aujourd'hui",
  a: 'A · Relief',
  b: 'B · Creusé',
  c: 'C · Pilule',
}

function Phone({ v }: { v: Variant }) {
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-foreground px-1 text-[15px] font-semibold">
        {TITLES[v]}
      </figcaption>
      <div
        data-glass-frame
        data-v={v}
        className="pf bg-background text-foreground relative w-[390px] overflow-hidden rounded-[1.6rem] shadow-[0_0_0_1px_rgb(0_0_0/8%)]"
      >
        <div className="glass-chrome flex h-12 items-center px-4 text-[17px] font-semibold">
          Opérations
        </div>
        <Toolbar v={v} />
        <Form />
      </div>
    </figure>
  )
}

function Board({ variants }: { variants: Variant[] }) {
  return (
    <div className="bg-background flex min-h-svh flex-wrap items-start gap-6 p-6">
      <style>{CSS}</style>
      {variants.map((v) => (
        <Phone key={v} v={v} />
      ))}
    </div>
  )
}

export const Comparaison: Story = {
  render: () => <Board variants={['now', 'a', 'b', 'c']} />,
}
export const Aujourdhui: Story = { render: () => <Board variants={['now']} /> }
export const ARelief: Story = { render: () => <Board variants={['a']} /> }
export const BCreuse: Story = { render: () => <Board variants={['b']} /> }
export const CPilule: Story = { render: () => <Board variants={['c']} /> }
