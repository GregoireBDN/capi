import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/**
 * Picks a category in the open picker (#396): its row in the last list
 * (« Toutes les catégories », or the results of a search), since « Les plus
 * utilisées » may show it too.
 */
export async function pickCategory(user: UserEvent, name: string | RegExp) {
  const lists = await screen.findAllByRole('radiogroup', { name: 'Catégorie' })
  const rows = within(lists[lists.length - 1]).getAllByRole('radio', { name })
  await user.click(rows[rows.length - 1])
}

/** A category field (`CategoryField`) by its label. */
export function categoryField(label: string, container = document.body) {
  return within(container).getByRole('button', {
    name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} :`),
  })
}

/** Opens a category field and picks a category in its panel. */
export async function chooseCategory(
  user: UserEvent,
  field: HTMLElement,
  name: string | RegExp,
) {
  await user.click(field)
  await pickCategory(user, name)
}
