import { Injectable } from '@nestjs/common';
import { YandexService } from 'src/providers/yandex/yandex.service';

@Injectable()
export class DriverService {
  constructor(private readonly yandexService: YandexService) {}

  async getDriverBalance(driverId: string) {
    const response = await this.yandexService.getDriverBalance(driverId);
    return response.balance;
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
