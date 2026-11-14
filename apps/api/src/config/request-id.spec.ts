import { describe, expect, it } from 'vitest'
import { genReqId } from './logger'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('genReqId', () => {
  it('reuses an incoming UUID', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
    expect(genReqId({ headers: { 'x-request-id': id } })).toBe(id)
    expect(genReqId({ headers: { 'x-request-id': id.toUpperCase() } })).toBe(id)
    expect(genReqId({ headers: { 'x-request-id': [id, 'other'] } })).toBe(id)
  })

  it.each([
    'req-1',
    'admin-login-ok',
    `0f8fad5b-d9cb-469f-a165-70867728950e\n{"level":50}`,
    ' 0f8fad5b-d9cb-469f-a165-70867728950e',
    'x'.repeat(5000),
    '',
  ])('mints a new id instead of %j', (value) => {
    const id = genReqId({ headers: { 'x-request-id': value } })
    expect(id).toMatch(UUID)
    expect(id).not.toBe(value)
  })

  it('mints an id when none is sent', () => {
    expect(genReqId({ headers: {} })).toMatch(UUID)
  })
})
