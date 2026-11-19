import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import {
  ACCESS_TOKEN_SCOPES,
  type AccessTokenScope,
} from '#/auth/access-tokens/access-tokens.schema'
import { MAX_ACCESS_TOKEN_TTL_DAYS } from '#/auth/access-tokens/access-tokens.constants'

export class CreateAccessTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: 100,
    example: 'Claude (MCP)',
  })
  name!: string

  @IsIn(ACCESS_TOKEN_SCOPES)
  @ApiProperty({ enum: ACCESS_TOKEN_SCOPES, enumName: 'AccessTokenScope' })
  scope!: AccessTokenScope

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ACCESS_TOKEN_TTL_DAYS)
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: MAX_ACCESS_TOKEN_TTL_DAYS,
    nullable: true,
    description:
      'Days until the token expires. Omitted or null: never expires.',
  })
  expiresInDays?: number | null
}

/** Renames a token (#329): the name is the only thing that can change. */
export class UpdateAccessTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @ApiProperty({ type: String, minLength: 1, maxLength: 100 })
  name!: string
}

export class AccessTokenDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({
    type: String,
    description: 'First characters of the token, to recognise it.',
    example: 'fin_pat_AbCd',
  })
  tokenPrefix!: string

  @ApiProperty({ enum: ACCESS_TOKEN_SCOPES, enumName: 'AccessTokenScope' })
  scope!: AccessTokenScope

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: string | null

  @ApiProperty({ type: Boolean, description: 'True once `expiresAt` is past.' })
  expired!: boolean
}

export class CreatedAccessTokenDto extends AccessTokenDto {
  @ApiProperty({
    type: String,
    description: 'The token itself. Returned only once, never stored in clear.',
  })
  token!: string
}

export class AccessTokenAuditEntryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  tokenId!: string

  @ApiProperty({ type: String })
  tokenName!: string

  @ApiProperty({ type: String, example: 'GET' })
  method!: string

  @ApiProperty({
    type: String,
    description: 'Route pattern, without ids or query string.',
    example: '/api/transactions/:id',
  })
  route!: string

  @ApiProperty({ type: Number, example: 200 })
  statusCode!: number

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string
}
