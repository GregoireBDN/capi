import { ApiProperty } from '@nestjs/swagger'
import {
  TRANSACTION_KINDS,
  type TransactionKind,
} from '#/database/schema/domain-enums'

export class CategoryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({
    type: String,
    description: 'Stable identifier referenced by seeds and imports.',
  })
  slug!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({
    enum: TRANSACTION_KINDS,
    enumName: 'TransactionKind',
    description: 'Category group: the kind given to its transactions.',
  })
  kind!: TransactionKind

  @ApiProperty({ type: String, nullable: true, example: '#d97706' })
  color!: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date
}
