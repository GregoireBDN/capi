import { describe, expect, it } from 'vitest'
import {
  centsToInput,
  formatBudgetAmount,
  parseEurosToCents,
  targetError,
} from './amount'

describe('parseEurosToCents', () => {
  it.each([
    ['400', 40_000],
    ['400,5', 40_050],
    ['400,05', 40_005],
    ['12.30', 1_230],
    ['1 234,56', 123_456],
    ['1 234,56 €', 123_456],
    ['0,99', 99],
    ['7,', 700],
  ])('reads %s as %i cents', (text, cents) => {
    expect(parseEurosToCents(text)).toBe(cents)
  })

  it.each([
    ['', null],
    ['abc', null],
    ['-5', null],
    ['1,234', null],
    ['1,2,3', null],
  ])('rejects %s', (text, result) => {
    expect(parseEurosToCents(text)).toBe(result)
  })
})

describe('centsToInput', () => {
  it('prints whole euros without decimals', () => {
    expect(centsToInput(40_000)).toBe('400')
    expect(centsToInput(12_345)).toBe('123,45')
    expect(centsToInput(1_205)).toBe('12,05')
  })
})

describe('targetError', () => {
  it('explains what is wrong', () => {
    expect(targetError('')).toBe('Indiquez un montant')
    expect(targetError('abc')).toMatch(/invalide/)
    expect(targetError('0')).toMatch(/supérieur à 0/)
    expect(targetError('20000000')).toMatch(/trop élevé/)
    expect(targetError('350,50')).toBeNull()
  })
})

describe('formatBudgetAmount', () => {
  it('drops the cents of whole euros only', () => {
    const plain = (cents: number) =>
      formatBudgetAmount(cents).replace(/\s/g, ' ')
    expect(plain(3_600)).toBe('36 €')
    expect(plain(4_459)).toBe('44,59 €')
    expect(plain(10)).toBe('0,10 €')
    expect(plain(155_200)).toBe('1 552 €')
  })
})
