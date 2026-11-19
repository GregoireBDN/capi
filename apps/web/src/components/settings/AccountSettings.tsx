import { Input } from '@finances/ui'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { profileControllerUpdate } from '#/api'
import type { UserDto } from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { useAuth } from '#/lib/auth-context'
import { SettingsGroup } from './SettingsList'

const MAX_NAME_LENGTH = 255

const memberSinceFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
})

/**
 * Compte (#300): the name edited in place and saved when the field is left
 * (or on Enter), with a toast offering « Annuler »; the email as text (it
 * cannot be changed); the sign-up date as one line.
 */
export function AccountSettings({ user }: { user: UserDto }) {
  const { refresh } = useAuth()
  const nameId = useId()
  const errorId = useId()
  const [name, setName] = useState(user.name)
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)

  // Follows the saved name (an undo, another tab).
  useEffect(() => setName(user.name), [user.name])

  async function save(next: string, previous: string, undo = false) {
    saving.current = true
    const res = await profileControllerUpdate({
      body: { name: next },
      throwOnError: false,
    })
    saving.current = false
    if (res.error) {
      toast.error('Impossible d’enregistrer le nom')
      setName(previous)
      return
    }
    await refresh()
    if (undo) return
    toast.success('Nom enregistré', {
      action: {
        label: 'Annuler',
        onClick: () => void save(previous, next, true),
      },
    })
  }

  function commit() {
    const next = name.trim()
    if (next === '') {
      setError('Le nom est requis')
      return
    }
    setError(null)
    if (next !== name) setName(next)
    if (next === user.name || saving.current) return
    void save(next, user.name)
  }

  return (
    <div className="@container space-y-6">
      <PageHeader title="Compte" />

      <div className="space-y-2">
        <SettingsGroup>
          <li className="flex min-h-14 items-center gap-3 px-3 py-1.5 text-sm">
            <label htmlFor={nameId} className="w-16 shrink-0 font-medium">
              Nom
            </label>
            <Input
              id={nameId}
              type="text"
              autoComplete="name"
              enterKeyHint="done"
              maxLength={MAX_NAME_LENGTH}
              value={name}
              aria-invalid={error !== null}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setName(event.target.value)
                if (error) setError(null)
              }}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
                if (event.key === 'Escape') {
                  setName(user.name)
                  setError(null)
                }
              }}
              className="min-w-0 flex-1"
            />
          </li>
          <li className="flex min-h-14 items-center gap-3 px-3 py-2 text-sm">
            <span className="w-16 shrink-0 font-medium">Email</span>
            <span className="text-muted-foreground min-w-0 flex-1 break-all">
              {user.email}
            </span>
          </li>
        </SettingsGroup>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-destructive px-3 text-sm"
          >
            {error}
          </p>
        )}
        <p className="text-muted-foreground px-3 text-xs">
          Membre depuis le {memberSinceFormat.format(new Date(user.createdAt))}.
        </p>
      </div>
    </div>
  )
}
