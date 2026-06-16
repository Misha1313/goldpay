import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  PaymentService,
  PayResponse,
} from 'src/providers/payment/payment.service';
import { YandexService } from 'src/providers/yandex/yandex.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity } from './entities/transaction.entity';
import { WithdrawRequest } from './requests/withdraw.request';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { TransactionStatusEnum } from './enums/transaction-status.enum';
import { TransactionCurrencyEnum } from './enums/transaction-curreny.enum';
import { Cron, CronExpression } from '@nestjs/schedule';
import { minDate } from 'class-validator';
import { format, subDays, subHours } from 'date-fns';
import { PaymentAccountEntity } from './entities/payment-account.entity';
import { GetPaymentAccountsRequest } from './requests/get-payment-accounts.request';
import { GetTransactionsRequest } from './requests/get-transactions.request';
import { JwtPayload } from '../auth/auth.service';
import { JobRunningHistoryEntity } from '../common/entities/job-running-history.entity';
import { JobConfigEntity } from '../common/entities/job-config.entity';
import { JobConfigEnum } from '../common/enums/job-config.enum';
import { JobRunningStatusEnum } from '../common/enums/job-running-status.enum';
import { TransactionRegistrationEntity } from './entities/transaction-registration.entity';
import { BalanceRollbackEntity } from './entities/balance-rollback.entity';
import { BalanceRollbackStatusEnum } from './enums/balance-rollback-status.enum';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);
  constructor(
    private readonly yandexService: YandexService,
    private readonly paymentService: PaymentService,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    private readonly configService: ConfigService,
    @InjectRepository(PaymentAccountEntity)
    private readonly paymentAccountRepository: Repository<PaymentAccountEntity>,
    @InjectRepository(JobRunningHistoryEntity)
    private readonly jobRunningHistoryRepository: Repository<JobRunningHistoryEntity>,
    @InjectRepository(TransactionRegistrationEntity)
    private readonly transactionRegistrationRepository: Repository<TransactionRegistrationEntity>,
    @InjectRepository(BalanceRollbackEntity)
    private readonly balanceRollbackRepository: Repository<BalanceRollbackEntity>,
  ) {}

  async withdrawBalance(request: WithdrawRequest, jwtPayload: JwtPayload) {
    const { sub: driverId, parkId } = jwtPayload;

    await this.fillTransactionRegistration(driverId, parkId);

    const getBalanceResponse =
      await this.yandexService.getDriverBalance(driverId);

    // TODO - send error code
    if (getBalanceResponse.balance < request.amount) {
      console.log('Insufficient balance');
      throw new UnprocessableEntityException({
        errorCode: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient balance',
      });
    }

    // save in transactions table
    const newTransactionObject = this.transactionRepository.create({
      createdAt: new Date(),
      parkId: parkId,
      driverId: driverId,
      statusId: TransactionStatusEnum.New,
      iban: request.iban,
      receiverFirstName: request.firstName,
      receiverLastName: request.lastName,
      amount: request.amount,
      updatedAt: new Date(),
    });
    const newTransactionEntity =
      await this.transactionRepository.save(newTransactionObject);

    const infoResponse = await this.paymentService.info(
      request.iban,
      request.firstName,
      request.lastName,
      request.amount,
      newTransactionEntity.id,
    );

    console.log(
      'info response',
      infoResponse.errorCode,
      infoResponse.errorMessage,
    );

    // info returned error. payment can not be made
    if (infoResponse.errorCode) {
      await this.transactionRepository.update(
        { id: newTransactionEntity.id },
        {
          statusId: TransactionStatusEnum.Cancell,
          errorCode: infoResponse.errorCode,
          errorMessage: infoResponse.errorMessage,
        },
      );
      await this.transactionRegistrationRepository.delete({ driverId, parkId });
      return;
    }

    // substract transaction amount from yandex balance
    try {
      const updateBalanceResponse =
        await this.yandexService.updateDriverBalance(
          parkId,
          driverId,
          -request.amount,
        );

      console.log('updateBalanceResponse', updateBalanceResponse);

      const payResponse = await this.paymentService.pay(
        request.iban,
        request.firstName,
        request.lastName,
        request.amount,
        newTransactionEntity.id,
      );

      console.log(
        'pay response',
        payResponse.errorCode,
        payResponse.errorMessage,
        payResponse.data,
      );

      const updatedTransactionStatus =
        this.getUpdatedTransactionStatus(payResponse);

      await this.transactionRepository.update(
        { id: newTransactionEntity.id },
        {
          statusId: updatedTransactionStatus,
          errorCode: payResponse.errorCode,
          errorMessage: payResponse.errorMessage,
          providerTransactionId: payResponse.data?.id,
        },
      );

      console.log('updatedTransactionStatus', updatedTransactionStatus);

      if (
        updatedTransactionStatus === TransactionStatusEnum.Success ||
        updatedTransactionStatus === TransactionStatusEnum.Pending
      ) {
        if (request.savePaymentAccount || request.setDefaultPaymentAccount) {
          await this.savePaymentAccount(request, parkId, driverId);
        }
      }

      if (updatedTransactionStatus === TransactionStatusEnum.Cancell) {
        console.log('trying updateDriverBalance');
        await this.yandexService.updateDriverBalance(
          parkId,
          driverId,
          request.amount,
        );
      }

      if (updatedTransactionStatus !== TransactionStatusEnum.Pending) {
        await this.transactionRegistrationRepository.delete({
          driverId,
          parkId,
        });
      }
    } catch (error: any) {
      if (error.message === 'TRANSACTION_IN_PROGRESS') {
        throw error;
      }

      if (error.message === 'INSUFFICIENT_BALANCE') {
        await this.transactionRegistrationRepository.delete({
          driverId,
          parkId,
        });
        throw error;
      }

      if (['PAY', 'BALANCE_ROLLBACK'].includes(error.message)) {
        // await this.transactionRepository.update(
        //   { id: newTransactionEntity.id },
        //   {
        //     statusId: TransactionStatusEnum.Cancell,
        //     balanceUpdateErrorCode: error?.response?.data?.code,
        //     balanceUpdateErrorMessage: error?.response?.data?.message,
        //   },
        // );
        const balanceRollbackObject = this.balanceRollbackRepository.create({
          id: newTransactionEntity.id,
          createdAt: newTransactionEntity.createdAt,
          statusId: BalanceRollbackStatusEnum.New,
          amount: newTransactionEntity.amount,
        });
        await this.balanceRollbackRepository.insert(balanceRollbackObject);
      }
      await this.transactionRepository.update(
        { id: newTransactionEntity.id },
        {
          statusId: TransactionStatusEnum.Cancell,
        },
      );

      await this.transactionRegistrationRepository.delete({
        driverId,
        parkId,
      });
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

  private async executePay(
    request: Partial<WithdrawRequest>,
    transactionId: number,
  ) {
    const retries = Number(this.configService.get<number>('RETRY_NUMBER'));
    const delayMs = Number(this.configService.get<number>('RETRY_INTERVAL'));

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const payResponse = await this.paymentService.pay(
          request.iban,
          request.firstName,
          request.lastName,
          request.amount,
          transactionId,
        );

        console.log('payResponse', payResponse);

        // need to find out about other error codes too
        if (
          [3003, 9000, 9999].includes(payResponse.errorCode) &&
          attempt < retries
        ) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        return payResponse;
      } catch (error) {
        console.log('executePay error');
      }
    }
  }

  getUpdatedTransactionStatus(payResponse: PayResponse) {
    if (payResponse.errorCode !== 0) return TransactionStatusEnum.Cancell;
    if (payResponse.errorCode === 0) return payResponse?.data.status;
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
    return this.yandexService.updateDriverBalance(parkId, driverId, 5);
  }
}

// თუ გატანა ან თანხის დაბრუნება დაერორდა, თანხა უკან უნდა დავაბრუნო ჯობით
//
