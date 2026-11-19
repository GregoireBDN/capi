import { describe, expect, it } from 'vitest'
import { assetColor, isHexColor, textOn } from './asset-colors'

describe('asset colours', () => {
  it('knows the common coins by ticker, whatever the case', () => {
    expect(assetColor('BTC')).toBe('#F7931A')
    expect(assetColor(' eth ')).toBe('#627EEA')
    expect(assetColor('XYZ')).toBeUndefined()
  })

  it('writes the ticker near black on light discs, white on the others', () => {
    expect(textOn('#F3BA2F')).toBe('#111111') // BNB yellow
    expect(textOn('#F7931A')).toBe('#111111') // BTC orange
    expect(textOn('#C2A633')).toBe('#111111') // DOGE gold
    expect(textOn('#627EEA')).toBe('#ffffff') // ETH blue
    expect(textOn('#23292F')).toBe('#ffffff') // XRP near black
  })

  it('tells a coin colour from a palette variable', () => {
    expect(isHexColor('#F7931A')).toBe(true)
    expect(isHexColor('var(--chart-1)')).toBe(false)
  })
})
