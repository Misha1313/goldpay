import { Module } from '@nestjs/common';
import { YandexModule } from 'src/providers/yandex/yandex.module';
import { PaymentModule } from 'src/providers/payment/payment.module';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from './entities/transaction.entity';
import { TransactionStatusEntity } from './entities/transaction-status.entity';
import { PaymentAccountEntity } from './entities/payment-account.entity';
import { CommonModule } from '../common/common.module';
import { TransactionRegistrationEntity } from './entities/transaction-registration.entity';
import { BalanceRollbackEntity } from './entities/balance-rollback.entity';
import { BalanceRollbackStatusEntity } from './entities/balance-rollback-status.entity';
import { BalanceRollbackService } from './services/balance-rollback.service';
import { CheckPaymentService } from './services/check-payment.service';
import { ProcessWithdrawalService } from './services/process-withdrawal.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionEntity,
      TransactionStatusEntity,
      PaymentAccountEntity,
      TransactionRegistrationEntity,
      BalanceRollbackEntity,
      BalanceRollbackStatusEntity,
    ]),
    YandexModule,
    PaymentModule,
    CommonModule,
  ],
  controllers: [TransactionController],
  providers: [
    TransactionService,
    BalanceRollbackService,
    CheckPaymentService,
    ProcessWithdrawalService,
  ],
  exports: [TransactionService],
})
export class TransactionModule {}
