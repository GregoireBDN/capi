import { CATEGORY_ICON_NAMES } from '@capi/ui'
import { describe, expect, it } from 'vitest'
import { CategoryIcon } from '#/api/types.gen'

describe('category icons (#287)', () => {
  it('are exactly the icons the API accepts, in its order', () => {
    expect(CATEGORY_ICON_NAMES).toEqual(Object.values(CategoryIcon))
  })
})
