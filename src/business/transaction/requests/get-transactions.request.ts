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
  @ApiProperty({ default: '4d98e8bc5e1b4787885eeb3dcfaa7cd1' })
  @IsNotEmpty()
  parkId: string;

  @ApiProperty({ default: '954b0ed5d8834f2bb09f781c63ff5b81' })
  @IsNotEmpty()
  driverId: string;

  // @ApiProperty({ default: '1' })
  // @Type(() => Number)
  // @IsNumber()
  // @Min(1)
  // @Max(100)
  // take: number;

  // @ApiProperty({ default: '1' })
  // @Type(() => Number)
  // @IsNumber()
  // @Min(0)
  // skip: number;
}
