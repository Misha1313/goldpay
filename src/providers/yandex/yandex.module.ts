import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { YandexService } from './yandex.service';
import { YandexLogEntity } from './yandex-log.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([YandexLogEntity]), HttpModule],
  providers: [YandexService],
  exports: [YandexService],
})
export class YandexModule {}
