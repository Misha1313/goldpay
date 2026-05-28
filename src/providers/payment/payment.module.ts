import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaymentService } from './payment.service';

@Module({
  imports: [HttpModule],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
