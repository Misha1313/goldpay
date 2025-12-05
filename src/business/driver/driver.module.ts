import { Module } from '@nestjs/common';
import { DriverController } from './driver.controller';
import { YandexModule } from 'src/providers/yandex/yandex.module';
import { DriverService } from './driver.service';

@Module({
  imports: [YandexModule],
  controllers: [DriverController],
  providers: [DriverService],
  exports: [DriverService],
})
export class DriverModule {}
