import { AuthOtpCodeEntity } from 'src/business/auth/entities/auth-otp-code.entity';
import { AuthEntity } from 'src/business/auth/entities/auth.entity';
import { JobConfigEntity } from 'src/business/common/entities/job-config.entity';
import { JobRunningHistoryEntity } from 'src/business/common/entities/job-running-history.entity';
import { JobRunningStatusEntity } from 'src/business/common/entities/job-running-status.entity';
import { BalanceRollbackStatusEntity } from 'src/business/transaction/entities/balance-rollback-status.entity';
import { BalanceRollbackEntity } from 'src/business/transaction/entities/balance-rollback.entity';
import { PaymentAccountEntity } from 'src/business/transaction/entities/payment-account.entity';
import { TransactionRegistrationEntity } from 'src/business/transaction/entities/transaction-registration.entity';
import { TransactionStatusEntity } from 'src/business/transaction/entities/transaction-status.entity';
import { TransactionEntity } from 'src/business/transaction/entities/transaction.entity';

export const entities = [
  AuthEntity,
  AuthOtpCodeEntity,
  TransactionEntity,
  TransactionStatusEntity,
  PaymentAccountEntity,
  JobConfigEntity,
  JobRunningStatusEntity,
  JobRunningHistoryEntity,
  TransactionRegistrationEntity,
  BalanceRollbackEntity,
  BalanceRollbackStatusEntity,
];
