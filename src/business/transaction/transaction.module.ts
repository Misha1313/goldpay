import { Module } from '@nestjs/common';
import { YandexModule } from 'src/providers/yandex/yandex.module';
import { PaymentModule } from 'src/providers/payment/payment.module';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from './entities/transaction.entity';
import { TransactionStatusEntity } from './entities/transaction-status.entity';
import { PaymentAccountEntity } from './entities/payment-account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionEntity,
      TransactionStatusEntity,
      PaymentAccountEntity,
    ]),
    YandexModule,
    PaymentModule,
  ],
  controllers: [TransactionController],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}
