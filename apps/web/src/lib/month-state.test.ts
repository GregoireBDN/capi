import { describe, expect, it } from 'vitest'
import { monthState } from './month-state'

const months = ['2026-08', '2026-09', '2026-10', '2026-11']

describe('monthState', () => {
  it('says how far a partial month goes and what it is compared with', () => {
    expect(
      monthState({
        month: '2026-11',
        dataUntil: '2026-11-16',
        monthsWithData: months,
      }),
    ).toEqual({
      tone: 'partial',
      text: 'Données jusqu’au 16 nov. · comparées au 1–16 oct.',
      shortText: 'Jusqu’au 16 nov.',
      progress: 16 / 30,
    })
  })

  it('compares with the whole previous month when it is shorter', () => {
    expect(
      monthState({
        month: '2026-03',
        dataUntil: '2026-03-30',
        monthsWithData: ['2026-03'],
      }),
    ).toMatchObject({
      text: expect.stringContaining('comparées au 1–28 févr.'),
    })
  })

  it('says 1er for a single day', () => {
    expect(
      monthState({
        month: '2026-11',
        dataUntil: '2026-11-01',
        monthsWithData: months,
      }).text,
    ).toBe('Données jusqu’au 1er nov. · comparées au 1er oct.')
  })

  it('calls a month before the data, or reaching its last day, complete', () => {
    expect(
      monthState({
        month: '2026-10',
        dataUntil: '2026-11-16',
        monthsWithData: months,
      }),
    ).toEqual({ tone: 'complete', text: 'Mois complet' })
    expect(
      monthState({
        month: '2026-11',
        dataUntil: '2026-11-30',
        monthsWithData: months,
      }),
    ).toEqual({ tone: 'complete', text: 'Mois complet' })
  })

  it('calls a month without data empty', () => {
    const empty = {
      tone: 'empty',
      text: 'Aucune donnée importée',
      shortText: 'Aucune donnée',
    }
    expect(
      monthState({
        month: '2025-12',
        dataUntil: '2026-11-16',
        monthsWithData: months,
      }),
    ).toEqual(empty)
    expect(
      monthState({
        month: '2026-12',
        dataUntil: '2026-11-16',
        monthsWithData: months,
      }),
    ).toEqual(empty)
    expect(
      monthState({ month: '2026-11', dataUntil: null, monthsWithData: [] }),
    ).toEqual(empty)
  })

  it('gives a closed month the day it was closed, in Paris', () => {
    expect(
      monthState({
        month: '2026-09',
        dataUntil: '2026-11-16',
        monthsWithData: months,
        closedAt: '2026-10-02T22:30:00.000Z',
      }),
    ).toEqual({ tone: 'closed', text: 'le 3 oct.' })
  })
})
