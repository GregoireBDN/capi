import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'
import { PASSKEY_NAME_MAX_LENGTH } from '#/auth/passkeys/passkeys.constants'

/**
 * WebAuthn options and responses are opaque JSON for the API docs: their shape
 * is the WebAuthn spec's (`@simplewebauthn/browser` builds and reads them) and
 * the library validates them.
 */
const WEBAUTHN_JSON = {
  type: 'object',
  additionalProperties: true,
} as const

export class PasskeyDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, example: 'iPhone' })
  name!: string

  @ApiProperty({
    type: String,
    description: '`multiDevice` when synced (e.g. iCloud Keychain).',
    example: 'multiDevice',
  })
  deviceType!: string

  @ApiProperty({ type: Boolean })
  backedUp!: boolean

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: string | null
}

export class RegisterPasskeyDto {
  @IsObject()
  @ApiProperty({
    ...WEBAUTHN_JSON,
    description: 'Result of `startRegistration()` (RegistrationResponseJSON).',
  })
  response!: RegistrationResponseJSON

  @IsOptional()
  @IsString()
  @MaxLength(PASSKEY_NAME_MAX_LENGTH)
  @ApiPropertyOptional({
    type: String,
    maxLength: PASSKEY_NAME_MAX_LENGTH,
    example: 'iPhone',
  })
  name?: string
}

export class AuthenticatePasskeyDto {
  @IsObject()
  @ApiProperty({
    ...WEBAUTHN_JSON,
    description:
      'Result of `startAuthentication()` (AuthenticationResponseJSON).',
  })
  response!: AuthenticationResponseJSON
}

export class RenamePasskeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(PASSKEY_NAME_MAX_LENGTH)
  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: PASSKEY_NAME_MAX_LENGTH,
  })
  name!: string
}

/** `PublicKeyCredentialCreationOptionsJSON` / `...RequestOptionsJSON`. */
export const WEBAUTHN_OPTIONS_SCHEMA = {
  ...WEBAUTHN_JSON,
  description:
    'WebAuthn options for `startRegistration()` / `startAuthentication()`.',
}
