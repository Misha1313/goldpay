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

  private getUpdatedTransactionStatus(payResponse: PayResponse) {
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
          default: request.setDefaultPaymentAccount,
        },
      );
    } else {
      const paymentAccountObject = this.paymentAccountRepository.create({
        // createdAt: new Date(),
        parkId: parkId,
        driverId: driverId,
        iban: request.iban,
        receiverFirstName: request.firstName,
        receiverLastName: request.lastName,
        default: request.setDefaultPaymentAccount,
        updatedAt: new Date(),
      });

      await this.paymentAccountRepository.save(paymentAccountObject);
    }
  }

  // create job for pay check
  @Cron(CronExpression.EVERY_MINUTE)
  async handlePendingTransactions() {
    const lastJobRunningHistoryEntity = await this.jobRunningHistoryRepository
      .createQueryBuilder('job')
      .where('job.configKey = :configKey', {
        configKey: JobConfigEnum.WithdrawalStatusCheck,
      })
      .andWhere('job.startDate > :minDate', {
        minDate: format(subDays(new Date(), 1), 'yyyy-MM-dd HH:mm:ss'),
      })
      .orderBy('job.startDate', 'DESC')
      .getOne();

    if (
      lastJobRunningHistoryEntity?.statusId === JobRunningStatusEnum.Running
    ) {
      console.log(
        'Previous handlePendingTransactions is still running -- skipping',
      );
      return;
    }

    const jobRunningHistoryObject = this.jobRunningHistoryRepository.create({
      startDate: new Date(),
      configKey: JobConfigEnum.WithdrawalStatusCheck,
      statusId: JobRunningStatusEnum.Running,
      endDate: null,
    });

    const jobRunningHistoryEntity = await this.jobRunningHistoryRepository.save(
      jobRunningHistoryObject,
    );

    try {
      let offset = 0;
      const batchSize = 2;

      const currentDate = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
      const minDate = format(subDays(new Date(), 1), 'yyyy-MM-dd HH:mm:ss');

      while (true) {
        const transactions = await this.transactionRepository
          .createQueryBuilder('transaction')
          .where('transaction.createdAt > :minDate', {
            minDate,
          })
          .andWhere('transaction.createdAt < :maxDate', {
            maxDate: currentDate,
          })
          .andWhere('transaction.statusId = :pendingStatus', {
            pendingStatus: TransactionStatusEnum.Pending,
          })
          .orderBy('transaction.createdAt')
          .skip(offset)
          .take(batchSize)
          .getMany();

        console.log(
          'transactions',
          offset,
          transactions.map((item) => item.createdAt),
        );

        if (transactions.length === 0) break;

        await Promise.all(transactions.map((row) => this.payCheck(row)));

        offset += batchSize;
      }
      await this.jobRunningHistoryRepository.update(
        { id: jobRunningHistoryEntity.id },
        {
          statusId: JobRunningStatusEnum.Success,
        },
      );
    } catch (error: any) {
      this.logger.error(error);
      await this.jobRunningHistoryRepository.update(
        { id: jobRunningHistoryEntity.id },
        {
          statusId: JobRunningStatusEnum.Error,
          error: error.message,
        },
      );
    }
  }

  private async payCheck(transaction: TransactionEntity) {
    try {
      await this.transactionRepository.update(
        { id: transaction.id },
        {
          statusId: TransactionStatusEnum.StatusCheck,
        },
      );

      const payCheckResponse = await this.paymentService.payCheck(
        transaction.id,
      );
      console.log(
        'errorCode',
        payCheckResponse.errorCode,
        payCheckResponse.data?.status,
      );

      // transaction did not reach provider. It needs to be repeated. May I delete it?
      if (payCheckResponse.errorCode === 3015) {
        // const payResponse = await this.executePay(request, transaction.id);

        const payResponse = await this.paymentService.pay(
          transaction.iban,
          transaction.receiverFirstName,
          transaction.receiverLastName,
          transaction.amount,
          transaction.id,
        );

        const updatedTransactionStatus =
          this.getUpdatedTransactionStatus(payResponse);

        await this.transactionRepository.update(
          { id: transaction.id },
          {
            statusId: updatedTransactionStatus,
            errorCode: payResponse.errorCode,
            errorMessage: payResponse.errorMessage,
          },
        );

        // transaction failed
        if (
          payResponse.errorCode !== 0 ||
          payResponse.data?.status === TransactionStatusEnum.Cancell
        ) {
          console.log('error - returning driver balance');
          await this.yandexService.updateDriverBalance(
            transaction.parkId,
            transaction.driverId,
            transaction.amount,
          );
        }
        return;
      }
      console.log('not 3015');

      // transaction is still in pending state or provider service is temporary not available
      if (
        payCheckResponse.data?.status === TransactionStatusEnum.Pending ||
        [3003, 9000, 9999].includes(payCheckResponse.errorCode)
      ) {
        await this.transactionRepository.update(
          { id: transaction.id },
          {
            statusId: TransactionStatusEnum.Pending,
          },
        );
        return;
      }

      console.log('not pending');

      // transaction is success
      if (payCheckResponse.data?.status === TransactionStatusEnum.Success) {
        await this.transactionRepository.update(
          { id: transaction.id },
          {
            statusId: TransactionStatusEnum.Success,
          },
        );

        await this.transactionRegistrationRepository.delete({
          driverId: transaction.driverId,
          parkId: transaction.parkId,
        });

        return;
      }

      console.log('not success');

      // transaction failed
      await this.yandexService.updateDriverBalance(
        transaction.parkId,
        transaction.driverId,
        transaction.amount,
      );

      await this.transactionRegistrationRepository.delete({
        driverId: transaction.driverId,
        parkId: transaction.parkId,
      });

      await this.transactionRepository.update(
        { id: transaction.id },
        {
          statusId: TransactionStatusEnum.Cancell,
          errorCode: payCheckResponse.errorCode,
          errorMessage: payCheckResponse.errorMessage,
        },
      );
    } catch (error: any) {
      if (error?.message === 'balance update') {
        console.log('balance error', error?.cause?.response?.data);
        await this.transactionRepository.update(
          { id: transaction.id },
          {
            statusId: TransactionStatusEnum.Cancell,
            balanceUpdateErrorCode: error?.cause?.response?.data?.code,
            balanceUpdateErrorMessage: error?.cause?.response?.data?.message,
          },
        );
      } else {
        await this.transactionRepository.update(
          { id: transaction.id },
          {
            statusId: TransactionStatusEnum.Cancell,
          },
        );
      }
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

  @Cron(CronExpression.EVERY_MINUTE)
  async handleBalanceRollback() {
    const lastJobRunningHistoryEntity = await this.jobRunningHistoryRepository
      .createQueryBuilder('job')
      .where('job.configKey = :configKey', {
        configKey: JobConfigEnum.BalanceRollBack,
      })
      .andWhere('job.startDate > :minDate', {
        minDate: format(subDays(new Date(), 1), 'yyyy-MM-dd HH:mm:ss'),
      })
      .orderBy('job.startDate', 'DESC')
      .getOne();

    if (
      lastJobRunningHistoryEntity?.statusId === JobRunningStatusEnum.Running
    ) {
      console.log(
        'Previous handleBalanceRollback is still running -- skipping',
      );
      return;
    }

    const jobRunningHistoryObject = this.jobRunningHistoryRepository.create({
      startDate: new Date(),
      configKey: JobConfigEnum.BalanceRollBack,
      statusId: JobRunningStatusEnum.Running,
      endDate: null,
    });

    const jobRunningHistoryEntity = await this.jobRunningHistoryRepository.save(
      jobRunningHistoryObject,
    );

    try {
      let offset = 0;
      const batchSize = 2;

      const currentDate = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
      const minDate = format(subDays(new Date(), 1), 'yyyy-MM-dd HH:mm:ss');

      while (true) {
        const balanceRollback = await this.balanceRollbackRepository
          .createQueryBuilder('balance')
          .leftJoinAndSelect('balance.transaction', 'transaction')
          .where('balance.createdAt > :minDate', {
            minDate,
          })
          .andWhere('balance.createdAt < :maxDate', {
            maxDate: currentDate,
          })
          .andWhere('balance.statusId IN (:...statuses)', {
            statuses: [
              BalanceRollbackStatusEnum.New,
              BalanceRollbackStatusEnum.Error,
            ],
          })
          .orderBy('balance.createdAt')
          .skip(offset)
          .take(batchSize)
          .getMany();

        console.log(
          'balance rollback',
          offset,
          balanceRollback.map((item) => item.createdAt),
        );

        if (balanceRollback.length === 0) break;

        await Promise.all(
          balanceRollback.map((row) => this.balanceRollback(row)),
        );

        offset += batchSize;
      }
      await this.jobRunningHistoryRepository.update(
        { id: jobRunningHistoryEntity.id },
        {
          statusId: JobRunningStatusEnum.Success,
        },
      );
    } catch (error: any) {
      this.logger.error(error);
      await this.jobRunningHistoryRepository.update(
        { id: jobRunningHistoryEntity.id },
        {
          statusId: JobRunningStatusEnum.Error,
          error: error.message,
        },
      );
    }
  }
  private async balanceRollback(balanceRollback: BalanceRollbackEntity) {
    try {
      await this.balanceRollbackRepository.update(
        { id: balanceRollback.id },
        {
          statusId: BalanceRollbackStatusEnum.Processing,
        },
      );
      await this.yandexService.updateDriverBalance(
        balanceRollback.transaction.parkId,
        balanceRollback.transaction.driverId,
        balanceRollback.amount,
      );

      await this.balanceRollbackRepository.update(
        { id: balanceRollback.id },
        {
          statusId: BalanceRollbackStatusEnum.Success,
        },
      );

      await this.transactionRegistrationRepository.delete({
        driverId: balanceRollback.transaction.driverId,
        parkId: balanceRollback.transaction.parkId,
      });
    } catch (error) {
      await this.balanceRollbackRepository.update(
        { id: balanceRollback.id },
        {
          statusId: BalanceRollbackStatusEnum.Error,
        },
      );
    }
  }
}

// თუ გატანა ან თანხის დაბრუნება დაერორდა, თანხა უკან უნდა დავაბრუნო ჯობით
//
