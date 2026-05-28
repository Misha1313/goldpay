import { AuthOtpCodeEntity } from 'src/business/auth/entities/auth-otp-code.entity';
import { AuthEntity } from 'src/business/auth/entities/auth.entity';
import { PaymentAccountEntity } from 'src/business/transaction/entities/payment-account.entity';
import { TransactionStatusEntity } from 'src/business/transaction/entities/transaction-status.entity';
import { TransactionEntity } from 'src/business/transaction/entities/transaction.entity';

export const entities = [
  AuthEntity,
  AuthOtpCodeEntity,
  TransactionEntity,
  TransactionStatusEntity,
  PaymentAccountEntity,
];
