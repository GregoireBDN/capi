import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'
import {
  ACCESS_TOKEN_SCOPES,
  type AccessTokenScope,
} from '#/auth/access-tokens/access-tokens.schema'

const PARAM_MAX_LENGTH = 2048

/**
 * The authorization request's parameters, as the consent page received them
 * in its URL (RFC 6749 §4.1.1 + PKCE + RFC 8707 `resource`). All optional
 * here: the service checks them and says which one is wrong.
 */
export class AuthorizeRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(PARAM_MAX_LENGTH)
  @ApiPropertyOptional({ type: String })
  client_id?: string

  @IsOptional()
  @IsString()
  @MaxLength(PARAM_MAX_LENGTH)
  @ApiPropertyOptional({ type: String })
  redirect_uri?: string

  @IsOptional()
  @IsString()
  @MaxLength(PARAM_MAX_LENGTH)
  @ApiPropertyOptional({ type: String })
  response_type?: string

  @IsOptional()
  @IsString()
  @MaxLength(PARAM_MAX_LENGTH)
  @ApiPropertyOptional({ type: String })
  code_challenge?: string

  @IsOptional()
  @IsString()
  @MaxLength(PARAM_MAX_LENGTH)
  @ApiPropertyOptional({ type: String })
  code_challenge_method?: string

  @IsOptional()
  @IsString()
  @MaxLength(PARAM_MAX_LENGTH)
  @ApiPropertyOptional({ type: String })
  scope?: string

  @IsOptional()
  @IsString()
  @MaxLength(PARAM_MAX_LENGTH)
  @ApiPropertyOptional({ type: String })
  state?: string

  @IsOptional()
  @IsString()
  @MaxLength(PARAM_MAX_LENGTH)
  @ApiPropertyOptional({ type: String })
  resource?: string
}

export class ApproveAuthorizationDto extends AuthorizeRequestDto {
  @IsBoolean()
  @ApiProperty({
    type: Boolean,
    description:
      'Grant the `write` scope (only when the client asked for it). False: read only.',
  })
  allowWrite!: boolean
}

/** What the consent page shows. */
export class AuthorizationDetailsDto {
  @ApiProperty({
    type: String,
    description: 'Name the client gave itself at registration (unverified).',
  })
  clientName!: string

  @ApiProperty({
    type: String,
    description: 'Host the browser is sent back to: the trust anchor.',
    example: 'claude.ai',
  })
  redirectHost!: string

  @ApiProperty({
    enum: ACCESS_TOKEN_SCOPES,
    enumName: 'AccessTokenScope',
    description: '`write` when the client asked for the write scope.',
  })
  requestedScope!: AccessTokenScope
}

export class AuthorizationRedirectDto {
  @ApiProperty({
    type: String,
    description:
      'Where to send the browser: the registered redirect URI with `code` (or `error`), `state` and `iss`.',
  })
  redirectTo!: string
}

/** A connected application (an approved grant) on the profile page. */
export class OAuthGrantDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  clientName!: string

  @ApiProperty({ type: String, example: 'claude.ai' })
  redirectHost!: string

  @ApiProperty({ enum: ACCESS_TOKEN_SCOPES, enumName: 'AccessTokenScope' })
  scope!: AccessTokenScope

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: string | null

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'The connection must be approved again after this.',
  })
  expiresAt!: string
}

export class OAuthAuditEntryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  grantId!: string

  @ApiProperty({ type: String })
  clientName!: string

  @ApiProperty({ type: String, example: 'GET' })
  method!: string

  @ApiProperty({ type: String, example: '/api/transactions' })
  route!: string

  @ApiProperty({ type: Number, example: 200 })
  statusCode!: number

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string
}

/** For the MCP adapter: the presented OAuth access token is valid. */
export class OAuthTokenInfoDto {
  @ApiProperty({ enum: ACCESS_TOKEN_SCOPES, enumName: 'AccessTokenScope' })
  scope!: AccessTokenScope

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string
}
