import fastifyHelmet from '@fastify/helmet'
import Fastify from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  API_PERMISSIONS_POLICY,
  registerPermissionsPolicy,
} from './permissions-policy'

describe('Permissions-Policy and cross-origin isolation on API responses (#204)', () => {
  const fastify = Fastify()

  beforeAll(async () => {
    registerPermissionsPolicy(fastify)
    // As registered in `main.ts`: helmet's defaults bring COOP and CORP.
    await fastify.register(fastifyHelmet)
    fastify.get('/api/probe', () => ({ ok: true }))
    fastify.get('/api/boom', () => {
      throw new Error('boom')
    })
    await fastify.ready()
  })

  afterAll(async () => {
    await fastify.close()
  })

  it.each([
    ['a response', '/api/probe'],
    ['an error', '/api/boom'],
    ['a 404', '/api/nope'],
  ])('sets them on %s', async (_label, url) => {
    const response = await fastify.inject({ method: 'GET', url })

    expect(response.headers['permissions-policy']).toBe(API_PERMISSIONS_POLICY)
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin')
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin')
  })

  it('denies every listed feature, passkeys included', () => {
    const entries = API_PERMISSIONS_POLICY.split(', ')

    expect(entries).toContain('camera=()')
    expect(entries).toContain('publickey-credentials-get=()')
    expect(entries.every((entry) => entry.endsWith('=()'))).toBe(true)
  })
})
