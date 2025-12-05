import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { AuthService } from '../auth.service';

@Injectable()
export class PhoneOtpStrategy extends PassportStrategy(Strategy, 'phone-otp') {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(req) {
    const { phoneNumber, code, roleId, parkId } = req.body; // request should also contiain whether it is driver or admin

    const user = await this.authService.validateOtp(
      phoneNumber,
      code,
      roleId,
      parkId,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid code');
    }

    return user; // attaches to req.user
  }
}
