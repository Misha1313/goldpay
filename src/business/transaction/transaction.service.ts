import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PayResponse } from 'src/providers/payment/payment.service';
import { YandexService } from 'src/providers/yandex/yandex.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity } from './entities/transaction.entity';
import { WithdrawRequest } from './requests/withdraw.request';
import { TransactionStatusEnum } from './enums/transaction-status.enum';
import { format, subHours, subSeconds } from 'date-fns';
import { PaymentAccountEntity } from './entities/payment-account.entity';
import { GetTransactionsRequest } from './requests/get-transactions.request';
import { JwtPayload } from '../auth/auth.service';
import { TransactionRegistrationEntity } from './entities/transaction-registration.entity';
import { DriverBalanceUpdateDescriptionEnum } from '../common/enums/driver-balance-update-description.enum';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../utils/app-error';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);
  constructor(
    private readonly yandexService: YandexService,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(PaymentAccountEntity)
    private readonly paymentAccountRepository: Repository<PaymentAccountEntity>,
    @InjectRepository(TransactionRegistrationEntity)
    private readonly transactionRegistrationRepository: Repository<TransactionRegistrationEntity>,
  ) {}

  async withdrawBalance(request: WithdrawRequest, jwtPayload: JwtPayload) {
    const { sub: driverId, parkId } = jwtPayload;

    const lastHourSuccessTransaction = await this.getLastHourSuccessTransaction(
      parkId,
      driverId,
    );

    if (lastHourSuccessTransaction) {
      console.log('Too many requests');
      throw new UnprocessableEntityException({
        errorCode: 'TOO_MANY_REQUESTS',
        message: 'Too many requests',
      });
    }

    const getBalanceResponse = await this.yandexService.getDriverBalance(
      driverId,
      'withdrawBalance',
    );

    // TODO - send error code
    if (getBalanceResponse.balance < request.amount) {
      console.log('Insufficient balance');
      throw new UnprocessableEntityException({
        errorCode: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient balance',
      });
    }

    await this.fillTransactionRegistration(driverId, parkId);

    const transactionId = uuidv4();

    // save in transactions table
    const newTransactionObject = this.transactionRepository.create({
      id: transactionId,
      createdAt: new Date(),
      parkId: parkId,
      driverId: driverId,
      statusId: TransactionStatusEnum.New,
      iban: request.iban,
      receiverFirstName: request.firstName,
      receiverLastName: request.lastName,
      amount: request.amount,
      beforeBalance: getBalanceResponse.balance,
      updatedAt: new Date(),
    });
    const newTransactionEntity =
      await this.transactionRepository.save(newTransactionObject);

    try {
      const updateBalanceResponse =
        await this.yandexService.updateDriverBalance(
          parkId,
          driverId,
          -request.amount,
          'withdrawBalance',
          newTransactionObject.id,
        );

      console.log('updateBalanceResponse', updateBalanceResponse);

      if (request.savePaymentAccount || request.setDefaultPaymentAccount) {
        await this.savePaymentAccount(request, parkId, driverId);
      }

      await this.transactionRepository.update(
        { id: newTransactionEntity.id },
        {
          statusId: TransactionStatusEnum.ReadyToProcess,
        },
      );
    } catch (error: any) {
      await this.transactionRepository.update(
        { id: newTransactionEntity.id },
        {
          statusId: TransactionStatusEnum.Error,
          errorCode: error.code,
          errorMessage: error.message,
        },
      );

      await this.transactionRegistrationRepository.delete({
        driverId,
        parkId,
      });

      throw error;
    }
  }

  private async fillTransactionRegistration(driverId: string, parkId: string) {
    try {
      await this.transactionRegistrationRepository.insert({
        parkId,
        driverId,
      });
    } catch (error) {
      console.log('Driver already has an active transaction');
      throw new ConflictException({
        errorCode: 'TRANSACTION_IN_PROGRESS',
        message: 'User already has a pending transaction',
      });
    }
  }

  private async getLastHourSuccessTransaction(
    parkId: string,
    driverId: string,
  ) {
    return this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.createdAt > :minDate', {
        minDate: format(subHours(new Date(), 1), 'yyyy-MM-dd HH:mm:ss'),
      })
      .andWhere('transaction.parkId = :parkId', { parkId })
      .andWhere('transaction.driverId = :driverId', {
        driverId,
      })
      .andWhere('transaction.statusId = :statusId', {
        statusId: TransactionStatusEnum.Success,
      })
      .getOne();
  }

  getUpdatedTransactionStatus(payResponse: PayResponse) {
    if (payResponse.errorCode !== 0) return TransactionStatusEnum.Error;
    if (payResponse.errorCode === 0)
      return this.getTransactionStatus(payResponse?.data.status);
  }

  private async savePaymentAccount(
    request: WithdrawRequest,
    parkId: string,
    driverId: string,
  ) {
    const existingEntity = await this.paymentAccountRepository.findOneBy({
      parkId: parkId,
      driverId: driverId,
      iban: request.iban,
    });

    if (existingEntity) {
      await this.paymentAccountRepository.update(
        {
          parkId: parkId,
          driverId: driverId,
          iban: request.iban,
        },
        {
          receiverFirstName: request.firstName,
          receiverLastName: request.lastName,
          name: request.paymentAccountName,
          default: request.setDefaultPaymentAccount,
        },
      );
    } else {
      const paymentAccountObject = this.paymentAccountRepository.create({
        // createdAt: new Date(),
        parkId: parkId,
        driverId: driverId,
        name: request.paymentAccountName,
        iban: request.iban,
        receiverFirstName: request.firstName,
        receiverLastName: request.lastName,
        default: request.setDefaultPaymentAccount,
        updatedAt: new Date(),
      });

      await this.paymentAccountRepository.save(paymentAccountObject);
    }
  }

  async getPaymentAccounts(jwtPayload: JwtPayload) {
    const { sub: driverId, parkId } = jwtPayload;
    return this.paymentAccountRepository.findBy({
      parkId,
      driverId,
    });
  }

  async getTransactions(
    request: GetTransactionsRequest,
    jwtPayload: JwtPayload,
  ) {
    const { sub: driverId, parkId } = jwtPayload;
    const [data, count] = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select([
        'transaction.id',
        'transaction.createdAt',
        'transaction.amount',
        'transaction.statusId',
        'transaction.iban',
      ])
      .where('transaction.parkId = :parkId', { parkId })
      .andWhere('transaction.driverId = :driverId', {
        driverId,
      })
      .orderBy('transaction.createdAt', 'DESC')
      .take(request.take)
      .skip(request.skip)
      .getManyAndCount();

    return { data, count };
  }

  async refillBalance(jwtPayload: JwtPayload) {
    const { sub: driverId, parkId } = jwtPayload;
    if (
      ![
        '5f7db4f7e4dc4ff68505a25ee8606219', // alim
        '29daa66634ac497a94cbf32c3cea1a18', // misha
      ].includes(driverId)
    )
      return;
    return this.yandexService.updateDriverBalance(
      parkId,
      driverId,
      5,
      'refillBalance-dev',
    );
  }

  async yandexBalanceUpdateSucceeded(
    transactionEntity: TransactionEntity,
    description: string,
  ) {
    try {
      const parentProcess =
        description === DriverBalanceUpdateDescriptionEnum.BalanceWithdrawal
          ? 'withdrawBalance'
          : 'rollbackBalance';
      const { balance } = await this.yandexService.getDriverBalance(
        transactionEntity.driverId,
        `${parentProcess}.recheckBalance`,
        transactionEntity.id,
      );

      const { transactions } = await this.yandexService.getTransactions(
        transactionEntity.driverId,
        subSeconds(transactionEntity.createdAt, 3),
        new Date(),
        `${parentProcess}.recheckBalance`,
        transactionEntity.id,
      );

      console.log('transactions', transactions);

      const transaction = transactions.find((item) => {
        const amount =
          description === DriverBalanceUpdateDescriptionEnum.BalanceWithdrawal
            ? -1 * (Number(item.amount) || 0)
            : Number(item.amount) || 0;
        return (
          amount === Number(transactionEntity.amount) &&
          item.description === description
        );
      });

      if (!transaction) {
        throw new Error('transaction was not found');
      }

      const totalTransactionAmount = transactions.reduce(
        (sum, item) => sum + (Number(item.amount) || 0),
        0,
      );

      console.log(
        'yandexBalanceUpdateSucceeded paras:',
        balance,
        Number(transactionEntity.beforeBalance),
        totalTransactionAmount,
        Number(balance) -
          Number(transactionEntity.beforeBalance) -
          totalTransactionAmount,
      );

      if (
        !(
          Math.abs(
            Number(balance) -
              Number(transactionEntity.beforeBalance) -
              totalTransactionAmount,
          ) < 1
        )
      ) {
        throw new Error('balance was not updated');
      }

      return true;
    } catch (error: any) {
      console.log('yandexBalanceUpdateCheck Error:', error.message);
      const apiErrorCode = ['GET_DRIVER_BALANCE', 'GET_TRANSACTIONS'].includes(
        error.code,
      )
        ? '.' + error.code
        : '';
      const errorCode =
        description === DriverBalanceUpdateDescriptionEnum.BalanceWithdrawal
          ? 'DRIVER_BALANCE_WITHDRAWAL_CHECK'
          : 'DRIVER_BALANCE_ROLLBACK_CHECK';
      throw new AppError(error.message, errorCode + apiErrorCode);
    }
  }

  getTransactionStatus(status: number) {
    switch (status) {
      case 100:
        return TransactionStatusEnum.Pending;

      case 1000:
        return TransactionStatusEnum.Success;

      case 9999:
        return TransactionStatusEnum.Error;

      default:
        break;
    }
  }
}
