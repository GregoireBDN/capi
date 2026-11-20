import { useQuery } from '@tanstack/react-query'
import {
  BotIcon,
  ListFilterIcon,
  ShieldCheckIcon,
  TagsIcon,
  TriangleAlertIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react'
import type { UserDto } from '#/api/types.gen'
import { accessTokensQuery } from '#/components/access-tokens/queries'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { grantsQuery } from '#/components/oauth/queries'
import { contactsQuery } from '#/components/owed/queries'
import { passkeysQuery } from '#/components/passkeys/queries'
import { rulesQuery } from '#/components/rules/queries'
import { sessionsQuery } from '#/components/sessions/queries'
import { categoriesQuery } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { SettingsGroup, SettingsLinkRow } from './SettingsList'
import { accessSummary, countLabel, securitySummary } from './settings-summary'

/**
 * Réglages (#300): one list of sections, like iOS Settings, each row with
 * its current state and opening its own screen. Replaces the former Profil
 * page, ten cards in one scroll. Since #386 the theme and « Se
 * déconnecter » are in the account menu (`AccountMenu`, the header's
 * avatar), which opens this page: they are not repeated here.
 */
export function SettingsPage({ user }: { user: UserDto }) {
  const passkeys = useQuery(passkeysQuery)
  const sessions = useQuery(sessionsQuery)
  const categories = useQuery(categoriesQuery)
  const rules = useQuery(rulesQuery)
  const tokens = useQuery(accessTokensQuery)
  const grants = useQuery(grantsQuery)
  const contacts = useQuery(contactsQuery())

  const activeCategories = categories.data?.filter((c) => !c.archivedAt)

  return (
    <div className="@container space-y-6">
      <PageHeader title="Réglages" />

      <div className="space-y-5">
        <SettingsGroup label="Compte et sécurité">
          <SettingsLinkRow
            to={ROUTES.settingsAccount}
            icon={UserIcon}
            tone="primary"
            title="Compte"
            state={user.name}
          />
          <SettingsLinkRow
            to={ROUTES.settingsSecurity}
            icon={ShieldCheckIcon}
            tone="success"
            title="Sécurité"
            state={securitySummary(
              passkeys.data?.length,
              sessions.data?.length,
            )}
          />
        </SettingsGroup>

        <SettingsGroup label="Classement">
          <SettingsLinkRow
            to={ROUTES.categories}
            icon={TagsIcon}
            tone="warning"
            title="Catégories"
            state={
              activeCategories
                ? countLabel(
                    activeCategories.length,
                    'catégorie',
                    'catégories',
                    'Aucune catégorie',
                  )
                : null
            }
          />
          <SettingsLinkRow
            to={ROUTES.rules}
            icon={ListFilterIcon}
            tone="warning"
            title="Règles"
            state={
              rules.data
                ? countLabel(
                    rules.data.length,
                    'règle',
                    'règles',
                    'Aucune règle',
                  )
                : null
            }
          />
          <SettingsLinkRow
            to={ROUTES.settingsContacts}
            icon={UsersIcon}
            tone="warning"
            title="Contacts"
            state={
              contacts.data
                ? countLabel(
                    contacts.data.length,
                    'contact',
                    'contacts',
                    'Aucun contact',
                  )
                : null
            }
          />
        </SettingsGroup>

        <SettingsGroup label="Accès">
          <SettingsLinkRow
            to={ROUTES.settingsAccess}
            icon={BotIcon}
            tone="primary"
            title="Claude et accès"
            state={
              tokens.data && !grants.isPending
                ? accessSummary(tokens.data.length, grants.data?.length ?? null)
                : null
            }
          />
        </SettingsGroup>

        {/* The account deletion stays last, alone. */}
        <SettingsGroup label="Zone dangereuse">
          <SettingsLinkRow
            to={ROUTES.settingsDanger}
            icon={TriangleAlertIcon}
            tone="danger"
            title="Zone dangereuse"
            state="Supprimer le compte"
          />
        </SettingsGroup>
      </div>
    </div>
  )
}
