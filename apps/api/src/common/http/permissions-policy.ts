import type { FastifyInstance } from 'fastify'

/**
 * `Permissions-Policy` on every API response (#204): the API only answers
 * JSON, so no browser feature is ever needed in a document it serves (a JSON
 * response opened as a page, the Swagger UI outside production). Helmet
 * already sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy`
 * to `same-origin`. The web pages have their own policy, which keeps passkeys
 * (`apps/web/src/lib/security-headers.ts`).
 */
export const API_PERMISSIONS_POLICY = [
  'accelerometer',
  'bluetooth',
  'browsing-topics',
  'camera',
  'display-capture',
  'geolocation',
  'gyroscope',
  'hid',
  'idle-detection',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'publickey-credentials-create',
  'publickey-credentials-get',
  'screen-wake-lock',
  'serial',
  'usb',
  'xr-spatial-tracking',
]
  .map((feature) => `${feature}=()`)
  .join(', ')

export function registerPermissionsPolicy(fastify: FastifyInstance): void {
  fastify.addHook('onSend', (_request, reply, payload, done) => {
    reply.header('permissions-policy', API_PERMISSIONS_POLICY)
    done(null, payload)
  })
}
