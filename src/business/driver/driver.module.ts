import { Module } from '@nestjs/common';
import { DriverController } from './driver.controller';
import { YandexModule } from 'src/providers/yandex/yandex.module';
import { DriverService } from './driver.service';
import { PaymentModule } from 'src/providers/payment/payment.module';

@Module({
  imports: [YandexModule, PaymentModule],
  controllers: [DriverController],
  providers: [DriverService],
  exports: [DriverService],
})
export class DriverModule {}
