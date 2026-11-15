import { describe, expect, it } from 'vitest'
import { rankSuggestions, type SuggestionGroup } from './manual-suggestions'

/** Pure ranking of the suggested labels (#196). Synthetic labels only. */

const CAT_A = 'cat-a'
const CAT_B = 'cat-b'

function group(
  label: string,
  uses: number,
  extra: Partial<SuggestionGroup> = {},
): SuggestionGroup {
  return {
    key: label.trim().toLowerCase(),
    label,
    categoryId: CAT_A,
    uses,
    lastUsed: '2026-10-01',
    manual: true,
    ...extra,
  }
}

describe('rankSuggestions', () => {
  const pickable = new Set([CAT_A, CAT_B])

  it('ranks by uses, typed labels counting double, then recency', () => {
    const items = rankSuggestions(
      [
        group('Merchant X', 3, { manual: false }),
        group('Typed Y', 2),
        group('Typed Z', 2, { lastUsed: '2026-10-05' }),
      ],
      pickable,
      10,
    )
    expect(items.map((item) => item.label)).toEqual([
      'Typed Z',
      'Typed Y',
      'Merchant X',
    ])
  })

  it('merges spellings and shows the latest typed one', () => {
    const items = rankSuggestions(
      [
        group('café test', 1, { key: 'café test', lastUsed: '2026-10-01' }),
        group('Café Test', 1, { key: 'café test', lastUsed: '2026-10-03' }),
        group('CAFE TEST', 5, {
          key: 'café test',
          lastUsed: '2026-10-09',
          manual: false,
        }),
      ],
      pickable,
      10,
    )
    expect(items).toEqual([{ label: 'Café Test', categoryId: CAT_A }])
  })

  it('fills the category only when it covers at least 70 % of the uses', () => {
    const items = rankSuggestions(
      [
        group('Seven', 7),
        group('Seven', 3, { categoryId: CAT_B }),
        group('Six', 6),
        group('Six', 4, { categoryId: null }),
      ],
      pickable,
      10,
    )
    expect(items).toEqual([
      { label: 'Seven', categoryId: CAT_A },
      { label: 'Six', categoryId: null },
    ])
  })

  it('leaves out a category that is not pickable', () => {
    expect(rankSuggestions([group('Label', 2)], new Set([CAT_B]), 10)).toEqual([
      { label: 'Label', categoryId: null },
    ])
  })

  it('drops merchants seen once, empty labels, and keeps the limit', () => {
    const items = rankSuggestions(
      [
        group('Once', 1, { manual: false }),
        group('', 4, { key: '' }),
        group('A', 3),
        group('B', 2),
        group('C', 1),
      ],
      pickable,
      2,
    )
    expect(items.map((item) => item.label)).toEqual(['A', 'B'])
  })
})
