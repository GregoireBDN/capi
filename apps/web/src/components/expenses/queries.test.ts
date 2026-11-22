import { describe, expect, it } from 'vitest'
import { ApiRequestError } from '#/lib/queries'
import { manualExpenseErrorMessage } from './queries'

describe('manualExpenseErrorMessage', () => {
  it('tells how to delete an expense with a share repaid or let go (#438)', () => {
    const message = manualExpenseErrorMessage(
      new ApiRequestError(
        409,
        'A share already repaid or let go cannot be removed',
      ),
    )
    expect(message).toContain('déjà remboursée ou abandonnée')
    expect(message).toContain('déliez d’abord ses remboursements')
  })

  it('keeps the generic message for another conflict', () => {
    expect(
      manualExpenseErrorMessage(new ApiRequestError(409, 'Something else')),
    ).toBe('Une erreur est survenue. Réessayez.')
  })
})
