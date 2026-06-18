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
export class ProcessWithdrawalService {
  private readonly logger = new Logger(ProcessWithdrawalService.name);
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

  @Cron(CronExpression.EVERY_30_SECONDS)
  async runProcessWithdrawal() {
    const lastJobRunningHistoryEntity = await this.jobRunningHistoryRepository
      .createQueryBuilder('job')
      .where('job.configKey = :configKey', {
        configKey: JobConfigEnum.WithdrawalProcessing,
      })
      .andWhere('job.startDate > :minDate', {
        minDate: format(subDays(new Date(), 1), 'yyyy-MM-dd HH:mm:ss'),
      })
      .orderBy('job.startDate', 'DESC')
      .getOne();

    if (
      lastJobRunningHistoryEntity?.statusId === JobRunningStatusEnum.Running
    ) {
      console.log('Previous processWithdrawal is still running -- skipping');
      return;
    }

    const jobRunningHistoryObject = this.jobRunningHistoryRepository.create({
      startDate: new Date(),
      configKey: JobConfigEnum.WithdrawalProcessing,
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
          .andWhere('transaction.statusId = :statusId', {
            statusId: TransactionStatusEnum.ReadyToProcess,
          })
          .orderBy('transaction.createdAt')
          .skip(offset)
          .take(batchSize)
          .getMany();

        console.log(
          'process withdrawal',
          offset,
          transactions.map((item) => item.createdAt),
        );

        if (transactions.length === 0) break;

        await Promise.all(
          transactions.map((row) => this.processWithdrawal(row)),
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

  private async processWithdrawal(transaction: TransactionEntity) {
    try {
      await this.transactionRepository.update(
        { id: transaction.id },
        {
          statusId: TransactionStatusEnum.Processing,
        },
      );

      const payResponse = await this.paymentService.pay(
        transaction.iban,
        transaction.receiverFirstName,
        transaction.receiverLastName,
        transaction.amount,
        transaction.id,
      );

      console.log(
        'pay response',
        payResponse.errorCode,
        payResponse.errorMessage,
        payResponse.data,
      );

      const updatedTransactionStatus =
        this.transactionService.getUpdatedTransactionStatus(payResponse);

      console.log('updatedTransactionStatus', updatedTransactionStatus);

      // if (
      //   updatedTransactionStatus === TransactionStatusEnum.Success ||
      //   updatedTransactionStatus === TransactionStatusEnum.Pending
      // ) {
      //   if (request.savePaymentAccount || request.setDefaultPaymentAccount) {
      //     await this.savePaymentAccount(request, parkId, driverId);
      //   }
      // }

      if (updatedTransactionStatus === TransactionStatusEnum.Cancell) {
        console.log('trying updateDriverBalance');
        await this.yandexService.updateDriverBalance(
          transaction.parkId,
          transaction.driverId,
          transaction.amount,
        );
      }

      await this.transactionRepository.update(
        { id: transaction.id },
        {
          statusId: updatedTransactionStatus,
          errorCode: payResponse.errorCode,
          errorMessage: payResponse.errorMessage,
          providerTransactionId: payResponse.data?.id,
        },
      );

      if (updatedTransactionStatus !== TransactionStatusEnum.Pending) {
        await this.transactionRegistrationRepository.delete({
          driverId: transaction.driverId,
          parkId: transaction.parkId,
        });
      }
    } catch (error: any) {
      if (['PAY', 'BALANCE_ROLLBACK'].includes(error.message)) {
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
