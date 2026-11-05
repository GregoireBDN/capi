import { userControllerRemove, userControllerUpdate } from '#/api'
import { getInitials } from '#/components/app-shell/user-initials'
import { useAuth } from '#/lib/auth-context'
import { ROUTES } from '#/lib/routes'
import type { ThemeMode as Theme } from '#/lib/use-theme'
import { useThemePreference } from '#/lib/use-theme-preference'
import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Field,
  FieldError,
  FieldLabel,
  Input,
} from '@finances/ui'
import {
  BadgeCheckIcon,
  CalendarDaysIcon,
  MailIcon,
  MonitorIcon,
  MoonIcon,
  ShieldAlertIcon,
  SunIcon,
  TriangleAlertIcon,
  UserIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  const { mode, setPreference } = useThemePreference(currentUser.id)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const form = useForm<NameValues>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: currentUser.name },
  })

  const isDirty = form.formState.isDirty

  useEffect(() => {
    form.reset({ name: currentUser.name })
  }, [currentUser.name, form])

  async function onSubmitName(values: NameValues) {
    const res = await userControllerUpdate({
      path: { id: currentUser.id },
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

  async function onDeleteAccount() {
    setDeleting(true)
    const res = await userControllerRemove({
      path: { id: currentUser.id },
      throwOnError: false,
    })
    if (res.error) {
      toast.error('Impossible de supprimer le compte')
      setDeleting(false)
      return
    }
    await logout()
    await navigate({ to: ROUTES.auth })
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
          <div className="min-w-0 flex-1">
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
              <Badge variant="secondary" outline>
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
                loading={form.formState.isSubmitting}
                disabled={!isDirty}
              >
                Enregistrer les modifications
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
          <div className="grid grid-cols-3 gap-3">
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
                    'flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    selected
                      ? 'border-primary bg-primary/5 text-primary shadow-sm'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  ].join(' ')}
                >
                  <Icon className="size-5" />
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs opacity-70">{description}</span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlertIcon className="size-4" />
            Zone dangereuse
          </CardTitle>
          <CardDescription>
            La suppression de votre compte est définitive. Toutes vos données
            seront effacées et ne pourront pas être récupérées.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onConfirm={onDeleteAccount}
            title="Supprimer votre compte ?"
            description="Cette action est irréversible. Toutes vos données seront définitivement supprimées et vous ne pourrez pas récupérer votre compte."
            confirmLabel="Supprimer définitivement"
            variant="danger"
            loading={deleting}
            trigger={
              <Button variant="danger" outline>
                Supprimer mon compte
              </Button>
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
