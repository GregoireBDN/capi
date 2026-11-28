import { ApiProperty } from '@nestjs/swagger'

export const SESSION_SIGN_IN_METHODS = [
  'password',
  'passkey',
  'sign_up',
  'demo',
  'unknown',
] as const

/**
 * One active session (refresh-token family) of the owner, or one recently
 * ended by reuse detection (`reuseDetectedAt`, #292). Never carries a refresh
 * token or its hash.
 */
export class SessionDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'The session (refresh-token family) id.',
  })
  id!: string

  @ApiProperty({
    enum: SESSION_SIGN_IN_METHODS,
    enumName: 'SessionSignInMethod',
    description: '`unknown` for sessions started before the list existed.',
  })
  signInMethod!: (typeof SESSION_SIGN_IN_METHODS)[number]

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Browser and system of the sign-in, e.g. `Safari · iPhone`; null when unknown.',
    example: 'Safari · iPhone',
  })
  device!: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  signedInAt!: string

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'Last renewal of the access token (at most 15 minutes of use).',
  })
  lastUsedAt!: string

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When it ends without further use (30 days, 90 at most).',
  })
  expiresAt!: string

  @ApiProperty({
    type: Boolean,
    description: 'The session making this request.',
  })
  current!: boolean

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Set on a session ended by reuse detection (a refresh token presented again after it was renewed) in the last 30 days, listed so the owner sees it happened; `expiresAt` is then the same time. Null for an active session.',
  })
  reuseDetectedAt!: string | null
}
