import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { configService } from 'src/config/cli.config.service';
import { DriverService } from 'src/business/driver/driver.service';
import { JwtPayload } from '../auth.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private readonly driverService: DriverService) {
    super({
      jwtFromRequest: (req) => req?.cookies?.refreshToken,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // add findOne for partners/admin too
    // const user = await this.driverService.getDriverByPhone(payload.sub);

    return payload;
  }
}
