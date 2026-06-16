import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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

export class WithdrawRequest {
  @ApiProperty({ default: 'Tbc' })
  @IsNotEmpty()
  paymentAccountName: string;

  @ApiProperty({ default: 'GE33LB0111151009668000' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s/g, '').toUpperCase() : value,
  )
  @IsNotEmpty()
  @IsIBAN()
  @Matches(/^GE\d{2}(BG|TB|LB)/, {
    message: 'IBAN must be from Bank of Georgia, TBC, or Liberty Bank',
  })
  iban: string;

  @ApiProperty({ default: 'Amirani' })
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ default: 'Gachechiladze' })
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ default: '1' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1500)
  amount: number;

  @ApiProperty({ default: true })
  @IsBoolean()
  savePaymentAccount: boolean;

  @ApiProperty({ default: false })
  @IsBoolean()
  setDefaultPaymentAccount: boolean;
}
