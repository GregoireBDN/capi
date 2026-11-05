import { isRedirect } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserDto } from '#/api/types.gen'

import {
  redirectFromHome,
  redirectIfAuthenticated,
  requireUser,
} from './auth-guard'

const { fetchCurrentUser } = vi.hoisted(() => ({ fetchCurrentUser: vi.fn() }))
vi.mock('#/lib/auth', () => ({ fetchCurrentUser }))

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Owner Test',
  email: 'owner@example.test',
} as UserDto

/** Runs a guard and returns the redirect target it threw, if any. */
async function redirectTarget(guard: () => Promise<unknown>) {
  try {
    await guard()
    return undefined
  } catch (error) {
    if (!isRedirect(error)) throw error
    return error.options.to
  }
}

describe('auth guards', () => {
  beforeEach(() => {
    fetchCurrentUser.mockReset()
  })

  describe('requireUser (authenticated layout)', () => {
    it('redirects to /auth when nobody is signed in', async () => {
      fetchCurrentUser.mockResolvedValue(null)
      expect(await redirectTarget(requireUser)).toBe('/auth')
    })

    it('returns the signed-in user', async () => {
      fetchCurrentUser.mockResolvedValue(user)
      await expect(requireUser()).resolves.toBe(user)
    })
  })

  describe('redirectIfAuthenticated (login page)', () => {
    it('sends a signed-in user to the dashboard', async () => {
      fetchCurrentUser.mockResolvedValue(user)
      expect(await redirectTarget(redirectIfAuthenticated)).toBe('/dashboard')
    })

    it('lets an anonymous visitor through', async () => {
      fetchCurrentUser.mockResolvedValue(null)
      expect(await redirectTarget(redirectIfAuthenticated)).toBeUndefined()
    })
  })

  describe('redirectFromHome (/)', () => {
    it('goes to the dashboard when signed in', async () => {
      fetchCurrentUser.mockResolvedValue(user)
      expect(await redirectTarget(redirectFromHome)).toBe('/dashboard')
    })

    it('goes to the login page when signed out', async () => {
      fetchCurrentUser.mockResolvedValue(null)
      expect(await redirectTarget(redirectFromHome)).toBe('/auth')
    })
  })
})
