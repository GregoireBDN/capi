import { applyDecorators } from '@nestjs/common'
import { ApiProperty } from '@nestjs/swagger'
import {
  IsByteLength,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from '#/auth/auth.constants'

export const EmailField = () =>
  applyDecorators(IsEmail(), ApiProperty({ type: String }))

/**
 * A password typed to prove who you are (sign-in, current password): any
 * stored password must keep working, including those set before the
 * 12-character rule. Bounded only to keep bcrypt's input reasonable.
 */
export const PasswordField = () =>
  applyDecorators(
    IsString(),
    IsNotEmpty(),
    MaxLength(1024),
    ApiProperty({ type: String }),
  )

/**
 * A password being set (sign-up, reset, change): at least 12 characters
 * (ASVS 2.1.1) and at most 72 bytes in UTF-8, since bcrypt ignores the rest
 * (ASVS 2.1.3: no silent truncation).
 */
export const NewPasswordField = () =>
  applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, {
      message: `password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    }),
    IsByteLength(0, PASSWORD_MAX_BYTES, {
      message: `password must be at most ${PASSWORD_MAX_BYTES} bytes`,
    }),
    ApiProperty({
      type: String,
      minLength: PASSWORD_MIN_LENGTH,
      description: `At least ${PASSWORD_MIN_LENGTH} characters, at most ${PASSWORD_MAX_BYTES} bytes in UTF-8.`,
    }),
  )

export const NameField = () =>
  applyDecorators(IsString(), MinLength(1), ApiProperty({ type: String }))

export const TokenField = () =>
  applyDecorators(IsString(), ApiProperty({ type: String }))
