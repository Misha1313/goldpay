import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpModule } from '@nestjs/axios';
import { DriverModule } from './business/driver/driver.module';
import { YandexModule } from './providers/yandex/yandex.module';
import { AuthModule } from './business/auth/auth.module';
import { DatabaseModule } from './providers/database/database.module';
import { ConfigModule } from './config/config.module';
import { PaymentModule } from './providers/payment/payment.module';
import { TransactionModule } from './business/transaction/transaction.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    HttpModule,
    DriverModule,
    YandexModule,
    ConfigModule,
    AuthModule,
    DatabaseModule,
    PaymentModule,
    TransactionModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
