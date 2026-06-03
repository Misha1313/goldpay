import { Injectable } from '@nestjs/common';
import { PaymentService } from 'src/providers/payment/payment.service';
import { YandexService } from 'src/providers/yandex/yandex.service';
import { JwtPayload } from '../auth/auth.service';

export type DriverInfo = {
  firstName: string;
  lastName: string;
  balance: number;
}

@Injectable()
export class DriverService {
  constructor(private readonly yandexService: YandexService) {}

  async getDriverBalance(JwtPayload: JwtPayload) {
    const response = await this.yandexService.getDriverBalance(JwtPayload.sub);
    return response.balance;
  }

  async getDriverInfo(JwtPayload: JwtPayload): Promise<DriverInfo> {
    const [balance, profile] = await Promise.all([
      this.yandexService.getDriverBalance(JwtPayload.sub),
      this.yandexService.getDriverProfile(JwtPayload.sub)
    ])
    return {
      firstName: profile.person.full_name.first_name,
      lastName: profile.person.full_name.last_name,
      balance: balance.balance
    }
  }

  async getDriverByPhone(phoneNumber: string, parkId: string) {
    const result = await this.yandexService.getDriversProfiles({
      id: parkId,
    });

    const driverInfo = result.driver_profiles.find((item) =>
      item.driver_profile.phones.includes(phoneNumber),
    );

    return { ...driverInfo, parkId: result.parks[0].id };
  }
}
