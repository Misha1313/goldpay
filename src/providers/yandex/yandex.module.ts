import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { YandexService } from './yandex.service';

@Module({
  imports: [HttpModule],
  providers: [YandexService],
  exports: [YandexService],
})
export class YandexModule {}
