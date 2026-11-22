import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import {
  IMPORT_PROFILE_TARGETS,
  type ImportProfileTarget,
} from '#/database/schema/domain-enums'
import {
  CSV_DELIMITERS,
  CSV_ENCODINGS,
  type CsvDelimiter,
  type CsvEncoding,
  DATE_FORMATS,
  type DateFormat,
  DECIMAL_SEPARATORS,
  type DecimalSeparator,
} from '../profile.types'

const HEADER_MAX = 200
const HEADER_NAME_MAX = 200

const ENCODING_DOC = { enum: CSV_ENCODINGS, enumName: 'CsvEncoding' } as const
const DELIMITER_DOC = {
  enum: CSV_DELIMITERS,
  enumName: 'CsvDelimiter',
  description: 'Column separator (`\\t` for tab).',
} as const
const DECIMAL_DOC = {
  enum: DECIMAL_SEPARATORS,
  enumName: 'DecimalSeparator',
} as const
const DATE_FORMAT_DOC = {
  enum: DATE_FORMATS,
  enumName: 'CsvDateFormat',
} as const

/**
 * Header name of each field of a bank row. `amount` (signed), or both
 * `debit` and `credit`.
 */
export class CashColumnsDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(HEADER_NAME_MAX)
  date!: string

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(HEADER_NAME_MAX)
  label!: string

  @ApiPropertyOptional({ type: String, description: 'Signed amount.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(HEADER_NAME_MAX)
  amount?: string

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(HEADER_NAME_MAX)
  debit?: string

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(HEADER_NAME_MAX)
  credit?: string

  @ApiPropertyOptional({ type: String, description: 'Running balance.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(HEADER_NAME_MAX)
  balance?: string

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(HEADER_NAME_MAX)
  valueDate?: string
}

export class CreateImportProfileDto {
  @ApiProperty({ type: String, maxLength: 100, example: 'Banque en ligne' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string

  @ApiProperty({
    type: [String],
    description:
      'The file’s header names, in order (as `POST /import-profiles/inspect` gives them).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(HEADER_MAX)
  @IsString({ each: true })
  @MaxLength(HEADER_NAME_MAX, { each: true })
  headers!: string[]

  @ApiProperty(ENCODING_DOC)
  @IsIn(CSV_ENCODINGS)
  encoding!: CsvEncoding

  @ApiProperty(DELIMITER_DOC)
  @IsIn(CSV_DELIMITERS)
  delimiter!: CsvDelimiter

  @ApiProperty(DECIMAL_DOC)
  @IsIn(DECIMAL_SEPARATORS)
  decimalSeparator!: DecimalSeparator

  @ApiProperty(DATE_FORMAT_DOC)
  @IsIn(DATE_FORMATS)
  dateFormat!: DateFormat

  @ApiProperty({ type: CashColumnsDto })
  @ValidateNested()
  @Type(() => CashColumnsDto)
  columns!: CashColumnsDto
}

export class ImportProfileDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({
    enum: IMPORT_PROFILE_TARGETS,
    enumName: 'ImportProfileTarget',
  })
  target!: ImportProfileTarget

  @ApiProperty(ENCODING_DOC)
  encoding!: CsvEncoding

  @ApiProperty(DELIMITER_DOC)
  delimiter!: CsvDelimiter

  @ApiProperty(DECIMAL_DOC)
  decimalSeparator!: DecimalSeparator

  @ApiProperty(DATE_FORMAT_DOC)
  dateFormat!: DateFormat

  @ApiProperty({
    type: [String],
    description:
      'Header the profile recognises, normalized (lower case, no accent).',
  })
  headers!: string[]

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Field → normalized header name.',
  })
  columns!: Record<string, string>

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: Date | null

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date
}

/** A guessed mapping: header names as written, any field may be missing. */
export class CsvColumnGuessDto {
  @ApiPropertyOptional({ type: String })
  date?: string

  @ApiPropertyOptional({ type: String })
  label?: string

  @ApiPropertyOptional({ type: String })
  amount?: string

  @ApiPropertyOptional({ type: String })
  debit?: string

  @ApiPropertyOptional({ type: String })
  credit?: string

  @ApiPropertyOptional({ type: String })
  balance?: string

  @ApiPropertyOptional({ type: String })
  valueDate?: string
}

export class CsvSuggestionDto {
  @ApiProperty(DECIMAL_DOC)
  decimalSeparator!: DecimalSeparator

  @ApiProperty({ ...DATE_FORMAT_DOC, nullable: true })
  dateFormat!: DateFormat | null

  @ApiProperty({
    type: CsvColumnGuessDto,
    description: 'Guessed field → header name (as in the file).',
  })
  columns!: CsvColumnGuessDto
}

export class RecognisedFormatDto {
  @ApiProperty({ enum: ['cic_csv', 'standard_csv', 'csv_profile'] })
  source!: 'cic_csv' | 'standard_csv' | 'csv_profile'

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  profileId!: string | null

  @ApiProperty({ type: String, nullable: true })
  profileName!: string | null
}

export class CsvInspectionDto {
  @ApiProperty(ENCODING_DOC)
  encoding!: CsvEncoding

  @ApiProperty(DELIMITER_DOC)
  delimiter!: CsvDelimiter

  @ApiProperty({ type: [String], description: 'Header names as written.' })
  headers!: string[]

  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    description: 'First lines after the header, one cell per header name.',
  })
  sample!: string[][]

  @ApiProperty({ type: 'integer', description: 'Lines after the header.' })
  lineCount!: number

  @ApiProperty({
    type: RecognisedFormatDto,
    nullable: true,
    description: 'The format the file is already read with, if any.',
  })
  recognised!: RecognisedFormatDto | null

  @ApiProperty({ type: CsvSuggestionDto })
  suggestion!: CsvSuggestionDto
}

/** Documents the multipart body of `POST /import-profiles/inspect`. */
export class InspectCsvBodyDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'A CSV file, at most 5 MB.',
  })
  file!: unknown
}
