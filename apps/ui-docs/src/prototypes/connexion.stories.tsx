import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import type { ReactNode, SVGProps } from 'react'
import { ChevronLeftIcon, FlaskConicalIcon, KeyRoundIcon } from 'lucide-react'
import { Button, Input, PasswordInput, cn } from '@capi/ui'
import wordmark from '../../../web/public/brand/capi-nom.svg?url'
import wordmarkLight from '../../../web/public/brand/capi-nom-clair.svg?url'
import markLight from '../../../web/public/brand/capi-mark-clair.svg?url'

/*
 * #543 prototypes: three directions for the sign-in page, one phone screen,
 * no scroll. Deleted by the PR that builds the chosen one.
 */

type Screen = 'accueil' | 'mot-de-passe'
interface Args {
  screen: Screen
  staging: boolean
}

const meta: Meta<Args> = {
  title: 'Prototypes/Connexion (#543)',
  parameters: { layout: 'fullscreen' },
  args: { screen: 'accueil', staging: false },
  argTypes: {
    screen: { control: 'inline-radio', options: ['accueil', 'mot-de-passe'] },
  },
}
export default meta
type Story = StoryObj<Args>

const TAGLINE = 'Vos comptes, d’un coup d’œil.'

function FaceId(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path
        d="M8 3H7.8C6.12 3 5.28 3 4.64 3.33 4.07 3.61 3.61 4.07 3.33 4.64 3 5.28 3 6.12 3 7.8V8M8 21H7.8C6.12 21 5.28 21 4.64 20.67 4.07 20.39 3.61 19.93 3.33 19.36 3 18.72 3 17.88 3 16.2V16M21 8V7.8C21 6.12 21 5.28 20.67 4.64 20.39 4.07 19.93 3.61 19.36 3.33 18.72 3 17.88 3 16.2 3H16M21 16V16.2C21 17.88 21 18.72 20.67 19.36 20.39 19.93 19.93 20.39 19.36 20.67 18.72 21 17.88 21 16.2 21H16M7.5 8V9.5M16.5 8V9.5M11 12.6C11.8 12.6 12.5 11.9 12.5 11.1V8M15.2 15.2C13.4 17 10.5 17 8.7 15.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex', className)}>
      <img src={wordmark} alt="Capi" className="h-full w-auto dark:hidden" />
      <img
        src={wordmarkLight}
        alt="Capi"
        className="hidden h-full w-auto dark:block"
      />
    </span>
  )
}

function StagingDisc({ className }: { className?: string }) {
  return (
    <span
      aria-label="Staging"
      className={cn(
        'grid size-9 place-items-center rounded-full bg-linear-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_6px_14px_-6px_rgb(5_150_105/70%)]',
        className,
      )}
    >
      <FlaskConicalIcon className="size-[0.9rem]" />
    </span>
  )
}

/** Soft blue light behind the glass: without something behind, glass reads flat. */
function GlassBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="bg-primary/25 dark:bg-primary/35 absolute -top-[18%] -left-[30%] size-[75vmax] rounded-full blur-3xl" />
      <div className="absolute -right-[35%] -bottom-[20%] size-[70vmax] rounded-full bg-sky-300/30 blur-3xl dark:bg-sky-500/20" />
    </div>
  )
}

function Frame({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      data-glass-frame
      className={cn(
        'bg-background text-foreground relative flex h-svh flex-col overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}

function PasswordFields({ labels = true }: { labels?: boolean }) {
  return (
    <div className="space-y-2.5">
      <label className="block space-y-1">
        <span className={cn('text-sm font-medium', !labels && 'sr-only')}>
          Email
        </span>
        <Input
          type="email"
          placeholder={labels ? '' : 'Email'}
          autoComplete="username webauthn"
        />
      </label>
      <label className="block space-y-1">
        <span className={cn('text-sm font-medium', !labels && 'sr-only')}>
          Mot de passe
        </span>
        <PasswordInput placeholder={labels ? '' : 'Mot de passe'} />
      </label>
    </div>
  )
}

function ForgotLink() {
  return (
    <Button type="button" variant="secondary" link size="xs">
      Mot de passe oublié ?
    </Button>
  )
}

/* A · Carte de verre: logo above, one glass card, Face ID first, the password
   behind one tap. */
function DirectionA({ screen: initial, staging }: Args) {
  const [screen, setScreen] = useState(initial)
  return (
    <Frame>
      <GlassBackdrop />
      <main className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-4 py-6">
        <header className="flex flex-col items-center gap-1.5 text-center">
          <div className="flex items-center gap-2">
            <Wordmark className="h-14" />
            {staging && <StagingDisc />}
          </div>
          <p className="text-muted-foreground text-sm">{TAGLINE}</p>
        </header>
        <section className="glass-panel rounded-sheet space-y-3 p-4">
          {screen === 'accueil' ? (
            <>
              <Button size="xl" fullWidth>
                <FaceId />
                Se connecter
              </Button>
              <Button
                variant="secondary"
                ghost
                size="lg"
                fullWidth
                onClick={() => setScreen('mot-de-passe')}
              >
                <KeyRoundIcon />
                Mot de passe
              </Button>
            </>
          ) : (
            <>
              <PasswordFields />
              <Button size="lg" fullWidth>
                Se connecter
              </Button>
              <div className="flex flex-wrap items-center justify-center gap-x-4">
                <Button
                  variant="secondary"
                  ghost
                  size="sm"
                  onClick={() => setScreen('accueil')}
                >
                  <FaceId />
                  Face ID
                </Button>
                <ForgotLink />
              </div>
            </>
          )}
        </section>
      </main>
    </Frame>
  )
}

/* B · Écran d'accueil: a blue hero with the mark, a glass sheet at the bottom
   under the thumb. */
function DirectionB({ screen: initial, staging }: Args) {
  const [screen, setScreen] = useState(initial)
  const open = screen === 'mot-de-passe'
  return (
    <Frame className="bg-primary">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_70%_at_20%_0%,oklch(0.7_0.16_250/80%),transparent_60%),radial-gradient(90%_60%_at_100%_40%,oklch(0.45_0.2_275/70%),transparent_70%)]"
      />
      <div className="relative flex flex-1 flex-col md:mx-auto md:w-full md:max-w-sm md:justify-center md:gap-6 md:py-10">
        <section
          className={cn(
            'relative flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-white transition-all',
            'md:flex-none',
          )}
        >
          <img
            src={markLight}
            alt=""
            className={cn('w-auto transition-all', open ? 'h-14' : 'h-24')}
          />
          <p className="font-heading text-3xl font-semibold tracking-tight">
            Capi
          </p>
          {!open && <p className="text-sm text-white/80">{TAGLINE}</p>}
          {staging && <StagingDisc className="absolute top-4 right-4" />}
        </section>
        <section className="glass-panel rounded-t-sheet relative space-y-3 px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:rounded-sheet md:pb-5">
          {open ? (
            <>
              <PasswordFields labels={false} />
              <Button size="lg" fullWidth>
                Se connecter
              </Button>
              <div className="flex flex-wrap items-center justify-center gap-x-4">
                <Button
                  variant="secondary"
                  ghost
                  size="sm"
                  onClick={() => setScreen('accueil')}
                >
                  <ChevronLeftIcon />
                  Retour
                </Button>
                <ForgotLink />
              </div>
            </>
          ) : (
            <>
              <Button size="xl" fullWidth>
                <FaceId />
                Se connecter
              </Button>
              <Button
                variant="secondary"
                ghost
                size="lg"
                fullWidth
                onClick={() => setScreen('mot-de-passe')}
              >
                Avec le mot de passe
              </Button>
            </>
          )}
        </section>
      </div>
    </Frame>
  )
}

/* C · Tout sous la main: no extra step, the fields and Face ID on one screen,
   no card. */
function DirectionC({ staging }: Args) {
  return (
    <Frame>
      <GlassBackdrop />
      <main className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-5 py-6">
        <header className="flex flex-col items-center gap-1.5 text-center">
          <div className="flex items-center gap-2">
            <Wordmark className="h-12" />
            {staging && <StagingDisc />}
          </div>
          <p className="text-muted-foreground text-sm">{TAGLINE}</p>
        </header>
        <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
          <PasswordFields labels={false} />
          <div className="flex gap-2">
            <Button size="lg" fullWidth className="flex-1">
              Se connecter
            </Button>
            <Button
              size="lg"
              variant="primary"
              outline
              aria-label="Se connecter avec Face ID"
              className="aspect-square px-0 [&_svg]:size-5"
            >
              <FaceId />
            </Button>
          </div>
          <div className="text-center">
            <ForgotLink />
          </div>
        </form>
      </main>
    </Frame>
  )
}

export const A_CarteDeVerre: Story = {
  name: 'A · Carte de verre',
  render: (a) => <DirectionA {...a} />,
}
export const B_EcranDAccueil: Story = {
  name: 'B · Écran d’accueil',
  render: (a) => <DirectionB {...a} />,
}
export const C_ToutSousLaMain: Story = {
  name: 'C · Tout sous la main',
  render: (a) => <DirectionC {...a} />,
}
