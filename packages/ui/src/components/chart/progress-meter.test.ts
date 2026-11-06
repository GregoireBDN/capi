import { describe, expect, it } from 'vitest'

import { getProgressMeterState } from './progress-meter'

describe('getProgressMeterState', () => {
  it('limit (budgets): on track, warning, then over target', () => {
    expect(getProgressMeterState(500, 1000, 0.9)).toBe('under')
    expect(getProgressMeterState(950, 1000, 0.9)).toBe('warning')
    expect(getProgressMeterState(1000, 1000, 0.9)).toBe('warning')
    expect(getProgressMeterState(1001, 1000, 0.9)).toBe('over')
  })

  it('reach (savings): in progress, then reached, never a warning', () => {
    expect(getProgressMeterState(-200, 1000, 0.9, 'reach')).toBe('under')
    expect(getProgressMeterState(990, 1000, 0.9, 'reach')).toBe('under')
    expect(getProgressMeterState(1000, 1000, 0.9, 'reach')).toBe('reached')
    expect(getProgressMeterState(2500, 1000, 0.9, 'reach')).toBe('reached')
  })
})
