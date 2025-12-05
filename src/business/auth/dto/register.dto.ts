import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ default: '+995577090280' })
  @Matches(/^\+995\d{9}$/, {
    message: 'Incorrect phone number',
  })
  phoneNumber: string;

  // @ApiProperty({ default: 0 })
  // @IsNotEmpty()
  // roleId: number;
}
