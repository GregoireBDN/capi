import { applyDecorators } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional } from 'class-validator'
import {
  EmailField,
  NameField,
  NewPasswordField,
  PasswordField,
  TokenField,
} from './fields'

/** Also revoke every personal access token (MCP, scripts) and connected application (OAuth, #78). */
const RevokeAccessTokensField = () =>
  applyDecorators(
    IsOptional(),
    IsBoolean(),
    ApiPropertyOptional({
      type: Boolean,
      default: false,
      description:
        'Also revoke every personal access token and connected application (remote MCP). Other sessions are always ended.',
    }),
  )

export class RegisterDto {
  @EmailField()
  email!: string

  @NameField()
  name!: string

  @NewPasswordField()
  password!: string
}

export class LoginDto {
  @EmailField()
  email!: string

  @PasswordField()
  password!: string
}

export class ForgotPasswordDto {
  @EmailField()
  email!: string
}

export class VerifyEmailDto {
  @TokenField()
  token!: string
}

export class ResetPasswordDto {
  @TokenField()
  token!: string

  @NewPasswordField()
  password!: string

  @RevokeAccessTokensField()
  revokeAccessTokens?: boolean
}

export class ChangePasswordDto {
  @PasswordField()
  currentPassword!: string

  @NewPasswordField()
  newPassword!: string

  @RevokeAccessTokensField()
  revokeAccessTokens?: boolean
}

export class RegistrationStatusDto {
  @ApiProperty({
    type: Boolean,
    description: 'True until the single owner account has been created.',
  })
  open!: boolean
}
