import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'
import { themeEnum } from '#/user/user.schema'

const THEMES = themeEnum.enumValues

export class UserDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  email!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ enum: ['light', 'dark', 'auto'] })
  theme!: 'light' | 'dark' | 'auto'

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    required: false,
  })
  emailVerifiedAt!: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string
}

/**
 * Profile changes the owner may make to their own account. Email and password
 * are not here: they only change through the auth flows.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string

  @ApiPropertyOptional({ enum: THEMES })
  @IsOptional()
  @IsIn(THEMES)
  theme?: (typeof THEMES)[number]
}
