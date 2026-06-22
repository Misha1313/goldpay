import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaymentService } from './payment.service';
import { PaymentLogEntity } from './payment-log.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentLogEntity]), HttpModule],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
