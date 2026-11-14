import { profileControllerUpdate } from '#/api'
import { AccessTokensCard } from '#/components/access-tokens/AccessTokensCard'
import { PasskeysCard } from '#/components/passkeys/PasskeysCard'
import { ChangePasswordCard } from '#/components/profile/ChangePasswordCard'
import { DeleteAccountCard } from '#/components/profile/DeleteAccountCard'
import { getInitials } from '#/components/app-shell/user-initials'
import { useAuth } from '#/lib/auth-context'
import { ROUTES } from '#/lib/routes'
import type { ThemeMode as Theme } from '#/lib/use-theme'
import { useThemePreference } from '#/lib/use-theme-preference'
import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
} from '@finances/ui'
import {
  BadgeCheckIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  MailIcon,
  MonitorIcon,
  MoonIcon,
  ShieldAlertIcon,
  SunIcon,
  TagsIcon,
  UserIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

export const Route = createFileRoute('/_app/profile')({
  head: () => ({ meta: [{ title: 'Profil · Finances' }] }),
  component: ProfilePage,
})

const nameSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
})
type NameValues = z.infer<typeof nameSchema>

const themes: Theme[] = ['light', 'dark', 'auto']

const themeOptions = {
  light: { label: 'Clair', description: 'Toujours clair', icon: SunIcon },
  dark: { label: 'Sombre', description: 'Toujours sombre', icon: MoonIcon },
  auto: {
    label: 'Système',
    description: 'Selon l’appareil',
    icon: MonitorIcon,
  },
} satisfies Record<
  Theme,
  { label: string; description: string; icon: LucideIcon }
>

function ProfilePage() {
  const { user: guardUser } = Route.useRouteContext()
  const { user, refresh, logout } = useAuth()
  const navigate = useNavigate()

  const currentUser = user ?? guardUser
  const { mode, setPreference } = useThemePreference()

  const form = useForm<NameValues>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: currentUser.name },
  })

  const isDirty = form.formState.isDirty

  useEffect(() => {
    form.reset({ name: currentUser.name })
  }, [currentUser.name, form])

  async function onSubmitName(values: NameValues) {
    const res = await profileControllerUpdate({
      body: { name: values.name },
      throwOnError: false,
    })
    if (res.error) {
      toast.error('Impossible de mettre à jour le profil')
      return
    }
    await refresh()
    toast.success('Nom mis à jour')
  }

  const initials = getInitials(currentUser.name)

  const isVerified = !!currentUser.emailVerifiedAt
  const memberSince = new Date(currentUser.createdAt).toLocaleDateString(
    'fr-FR',
    {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    },
  )

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Identity header */}
      <Card>
        <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-info text-xl font-bold text-primary-foreground shadow-sm ring-1 ring-foreground/10">
            {initials}
          </div>
          <div className="w-full min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">
              {currentUser.name}
            </h1>
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <MailIcon className="size-3.5 shrink-0" />
              <span className="truncate">{currentUser.email}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isVerified ? (
                <Badge variant="success" outline>
                  <BadgeCheckIcon />
                  Email vérifié
                </Badge>
              ) : (
                <Badge variant="warning" outline>
                  <ShieldAlertIcon />
                  Email non vérifié
                </Badge>
              )}
              <Badge
                variant="secondary"
                outline
                className="h-auto min-h-5 max-w-full shrink whitespace-normal"
              >
                <CalendarDaysIcon />
                Membre depuis {memberSince}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="size-4 text-muted-foreground" />
            Informations personnelles
          </CardTitle>
          <CardDescription>
            Mettez à jour le nom associé à votre compte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmitName)}
            className="space-y-5"
            noValidate
          >
            <Field data-invalid={!!form.formState.errors.name}>
              <FieldLabel htmlFor="name">Nom complet</FieldLabel>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                aria-invalid={!!form.formState.errors.name}
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <FieldError>{form.formState.errors.name.message}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="email">Adresse email</FieldLabel>
              <Input
                id="email"
                type="email"
                value={currentUser.email}
                readOnly
                disabled
              />
              <p className="text-muted-foreground text-xs">
                L’adresse email ne peut pas être modifiée pour le moment.
              </p>
            </Field>

            <div className="flex justify-end">
              <Button
                type="submit"
                className="w-full sm:w-auto"
                loading={form.formState.isSubmitting}
                disabled={!isDirty}
              >
                <span className="sm:hidden">Enregistrer</span>
                <span className="hidden sm:inline">
                  Enregistrer les modifications
                </span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SunIcon className="size-4 text-muted-foreground" />
            Apparence
          </CardTitle>
          <CardDescription>
            Choisissez le thème de l’interface. Sauvegardé et appliqué sur tous
            vos appareils.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
            {themes.map((value) => {
              const { label, description, icon: Icon } = themeOptions[value]
              const selected = mode === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => void setPreference(value)}
                  className={[
                    // One row per theme on phones, three tiles side by side from sm.
                    'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 rounded-lg border p-3 text-left transition-all sm:flex sm:flex-col sm:gap-2 sm:p-4 sm:text-center',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    selected
                      ? 'border-primary bg-primary/5 text-primary shadow-sm'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  ].join(' ')}
                >
                  <Icon className="row-span-2 size-5" />
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs opacity-70">{description}</span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TagsIcon className="size-4 text-muted-foreground" />
            Catégories
          </CardTitle>
          <CardDescription>
            Ajoutez, renommez, recolorez, archivez ou supprimez vos catégories,
            et réglez les règles qui classent vos opérations.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            outline
            className="w-full sm:w-auto"
            asChild
          >
            <Link to={ROUTES.categories}>
              Gérer les catégories
              <ChevronRightIcon />
            </Link>
          </Button>
          <Button
            variant="secondary"
            outline
            className="w-full sm:w-auto"
            asChild
          >
            <Link to={ROUTES.rules}>
              Gérer les règles
              <ChevronRightIcon />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <ChangePasswordCard email={currentUser.email} />

      <PasskeysCard email={currentUser.email} />

      <AccessTokensCard email={currentUser.email} />

      <DeleteAccountCard
        email={currentUser.email}
        onDeleted={async () => {
          await logout()
          await navigate({ to: ROUTES.auth })
        }}
      />
    </div>
  )
}
