import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, Length, Matches } from 'class-validator';

export class LoginOtpDto {
  @ApiProperty({ default: '+995577090280' })
  @Matches(/^\+995\d{9}$/, {
    message: 'Incorrect phone number',
  })
  phoneNumber: string;

  @ApiProperty({ default: '4d98e8bc5e1b4787885eeb3dcfaa7cd1' })
  @IsNotEmpty()
  parkId: string;

  @ApiProperty({ default: '1234' })
  @Length(4, 4)
  code: string;

  @ApiProperty({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  roleId: number;
}
