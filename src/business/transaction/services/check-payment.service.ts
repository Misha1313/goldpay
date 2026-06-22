import { Injectable, Logger } from '@nestjs/common';
import { YandexService } from 'src/providers/yandex/yandex.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { format, subDays } from 'date-fns';
import { JobRunningHistoryEntity } from 'src/business/common/entities/job-running-history.entity';
import { TransactionRegistrationEntity } from '../entities/transaction-registration.entity';
import { BalanceRollbackEntity } from '../entities/balance-rollback.entity';
import { JobConfigEnum } from 'src/business/common/enums/job-config.enum';
import { JobRunningStatusEnum } from 'src/business/common/enums/job-running-status.enum';
import { BalanceRollbackStatusEnum } from '../enums/balance-rollback-status.enum';
import { TransactionStatusEnum } from '../enums/transaction-status.enum';
import { PaymentService } from 'src/providers/payment/payment.service';
import { TransactionEntity } from '../entities/transaction.entity';
import { TransactionService } from '../transaction.service';

@Injectable()
export class CheckPaymentService {
  private readonly logger = new Logger(CheckPaymentService.name);
  constructor(
    private readonly yandexService: YandexService,
    private readonly paymentService: PaymentService,
    private readonly transactionService: TransactionService,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(JobRunningHistoryEntity)
    private readonly jobRunningHistoryRepository: Repository<JobRunningHistoryEntity>,
    @InjectRepository(TransactionRegistrationEntity)
    private readonly transactionRegistrationRepository: Repository<TransactionRegistrationEntity>,
    @InjectRepository(BalanceRollbackEntity)
    private readonly balanceRollbackRepository: Repository<BalanceRollbackEntity>,
  ) {}

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
      const batchSize = 50;

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
          'check transactions status',
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

      // transaction is success
      if (
        payCheckResponse.errorCode === 0 &&
        payCheckResponse.data?.status === TransactionStatusEnum.Success
      ) {
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
      if (
        (payCheckResponse.errorCode === 0 &&
          payCheckResponse.data?.status === TransactionStatusEnum.Cancell) ||
        payCheckResponse.errorCode === 3015
      ) {
        await this.yandexService.updateDriverBalance(
          transaction.parkId,
          transaction.driverId,
          transaction.amount,
          'payCheck',
          transaction.id,
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

        return;
      }

      console.log('not fail');

      await this.transactionRepository.update(
        { id: transaction.id },
        {
          statusId: TransactionStatusEnum.Pending,
        },
      );
    } catch (error: any) {
      if (['BALANCE_ROLLBACK'].includes(error.message)) {
        const balanceRollbackObject = this.balanceRollbackRepository.create({
          id: transaction.id,
          createdAt: transaction.createdAt,
          statusId: BalanceRollbackStatusEnum.New,
          amount: transaction.amount,
        });
        await this.balanceRollbackRepository.insert(balanceRollbackObject);
      }
      await this.transactionRepository.update(
        { id: transaction.id },
        {
          statusId: TransactionStatusEnum.Cancell,
          errorMessage: error.message,
        },
      );

      // await this.transactionRegistrationRepository.delete({
      //   driverId: transaction.driverId,
      //   parkId: transaction.parkId,
      // });

      throw error;
    }
  }
}
