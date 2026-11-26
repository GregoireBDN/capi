import { describe, expect, it } from 'vitest'
import type { DashboardWidgetDto } from '#/api/types.gen'
import { newElement } from './catalogue'
import { groupWidgets } from './group'

const widget = (
  type: DashboardWidgetDto['type'],
  values: Partial<DashboardWidgetDto> = {},
) => ({ ...newElement(type), ...values })

describe('groupWidgets', () => {
  it('keeps Fin de mois in Reste à dépenser, Patrimoine a card of its own', () => {
    const blocks = groupWidgets([
      widget('todo'),
      widget('left_to_spend'),
      widget('forecast'),
      widget('net_worth'),
      widget('tracked_budgets'),
    ])
    expect(blocks.map((block) => block.kind)).toEqual([
      'single',
      'glance',
      'single',
      'single',
    ])
    expect(blocks[1]).toMatchObject({ rows: ['forecast'] })
    expect(blocks[2].widget.type).toBe('net_worth')
  })

  it('draws them as cards of their own elsewhere or on chosen accounts', () => {
    const blocks = groupWidgets([
      widget('net_worth'),
      widget('left_to_spend'),
      widget('forecast', { accountIds: ['a'] }),
      widget('owed'),
    ])
    expect(
      blocks.map((block) => [
        block.kind,
        block.widget.type,
        block.kind === 'glance' ? block.rows : null,
      ]),
    ).toEqual([
      ['single', 'net_worth', null],
      ['glance', 'left_to_spend', []],
      ['single', 'forecast', null],
      ['single', 'owed', null],
    ])
  })

  it('leaves hidden elements out of the page and of the card', () => {
    const blocks = groupWidgets([
      widget('left_to_spend'),
      widget('forecast', { hidden: true }),
      widget('net_worth'),
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ rows: [] })
  })
})
