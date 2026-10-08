import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, Matches } from 'class-validator';
import { RoleEnum } from 'src/business/common/enums/role.enum';

export class SendOtpDto {
  @ApiProperty({ default: '+995577090280' })
  @Matches(/^\+995\d{9}$/, {
    message: 'Incorrect phone number',
  })
  phoneNumber: string;

  @ApiProperty({ default: '4d98e8bc5e1b4787885eeb3dcfaa7cd1' })
  @IsNotEmpty()
  parkId: string;

  @ApiProperty({ default: 0 })
  @Type(() => Number)
  @IsEnum(RoleEnum)
  roleId: number;
}
