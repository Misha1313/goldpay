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
          this.transactionService.getUpdatedTransactionStatus(payResponse);

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
}
