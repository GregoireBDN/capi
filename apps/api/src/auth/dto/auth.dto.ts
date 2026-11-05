import { ApiProperty } from '@nestjs/swagger'
import { EmailField, NameField, PasswordField, TokenField } from './fields'

export class RegisterDto {
  @EmailField()
  email!: string

  @NameField()
  name!: string

  @PasswordField()
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

  @PasswordField()
  password!: string
}

export class RegistrationStatusDto {
  @ApiProperty({
    type: Boolean,
    description: 'True until the single owner account has been created.',
  })
  open!: boolean
}
