import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { format, subDays, subSeconds } from 'date-fns';
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
import { DriverBalanceUpdateDescriptionEnum } from 'src/business/common/enums/driver-balance-update-description.enum';
import { AppError } from 'src/business/utils/app-error';

@Injectable()
export class ProcessWithdrawalService {
  private readonly logger = new Logger(ProcessWithdrawalService.name);
  constructor(
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
  async handleProcessWithdrawal() {
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

      const minDate = format(subDays(new Date(), 1), 'yyyy-MM-dd HH:mm:ss');
      const maxDate = format(subSeconds(new Date(), 30), 'yyyy-MM-dd HH:mm:ss');

      while (true) {
        const transactions = await this.transactionRepository
          .createQueryBuilder('transaction')
          .where('transaction.createdAt > :minDate', {
            minDate,
          })
          .andWhere('transaction.createdAt < :maxDate', {
            maxDate: maxDate,
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

      // await this.transactionService.yandexBalanceUpdateSucceeded(
      //   transaction,
      //   DriverBalanceUpdateDescriptionEnum.BalanceWithdrawal,
      // );

      const infoResponse = await this.paymentService.info(
        transaction.iban,
        transaction.receiverFirstName,
        transaction.receiverLastName,
        transaction.amount - 0.5,
        transaction.id,
      );

      console.log(
        'info response',
        infoResponse.errorCode,
        infoResponse.errorMessage,
      );

      // info returned error. payment can not be made
      if (infoResponse.errorCode) {
        throw new AppError(infoResponse.errorMessage, 'INFO');
      }

      const payResponse = await this.paymentService.pay(
        transaction.iban,
        transaction.receiverFirstName,
        transaction.receiverLastName,
        transaction.amount - 0.5,
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

      if (updatedTransactionStatus === TransactionStatusEnum.Error) {
        console.log('trying balance rollback');
        throw new AppError(payResponse.errorMessage, 'PAY');
      }

      await this.transactionRepository.update(
        { id: transaction.id },
        {
          statusId: updatedTransactionStatus,
          providerTransactionId: payResponse.data?.id,
        },
      );

      if (updatedTransactionStatus === TransactionStatusEnum.Success) {
        await this.transactionRegistrationRepository.delete({
          driverId: transaction.driverId,
          parkId: transaction.parkId,
        });
      }
    } catch (error: any) {
      if (['INFO', 'PAY'].includes(error.code)) {
        const balanceRollbackObject = this.balanceRollbackRepository.create({
          transactionId: transaction.id,
          transactionDate: transaction.createdAt,
          statusId: BalanceRollbackStatusEnum.New,
          amount: transaction.amount,
        });
        await this.balanceRollbackRepository.insert(balanceRollbackObject);

        await this.transactionRepository.update(
          { id: transaction.id },
          {
            statusId: TransactionStatusEnum.BalanceRollback,
            errorCode: error.code,
            errorMessage: error.message,
          },
        );

        throw error;
      }

      if (
        [
          'DRIVER_BALANCE_WITHDRAWAL_CHECK',
          'DRIVER_BALANCE_WITHDRAWAL_CHECK.GET_DRIVER_BALANCE',
          'DRIVER_BALANCE_WITHDRAWAL_CHECK.GET_TRANSACTIONS',
          'DRIVER_BALANCE_ROLLBACK_CHECK',
          'DRIVER_BALANCE_ROLLBACK_CHECK.GET_DRIVER_BALANCE',
          'DRIVER_BALANCE_ROLLBACK_CHECK.GET_TRANSACTIONS',
        ].includes(error.code)
      ) {
        await this.transactionRegistrationRepository.delete({
          driverId: transaction.driverId,
          parkId: transaction.parkId,
        });
      }
      await this.transactionRepository.update(
        { id: transaction.id },
        {
          statusId: TransactionStatusEnum.Error,
          errorCode: error.code,
          errorMessage: error.message,
        },
      );

      throw error;
    }
  }
}
