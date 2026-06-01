import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIBAN,
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsPositive,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { TransactionServiceEnum } from '../enums/transaction-service.enum';

export class GetTransactionsRequest {
  @ApiProperty({ default: '1' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  take: number;

  @ApiProperty({ default: '0' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  skip: number;
}
