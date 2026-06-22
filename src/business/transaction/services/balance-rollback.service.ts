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

@Injectable()
export class BalanceRollbackService {
  private readonly logger = new Logger(BalanceRollbackService.name);
  constructor(
    private readonly yandexService: YandexService,
    @InjectRepository(JobRunningHistoryEntity)
    private readonly jobRunningHistoryRepository: Repository<JobRunningHistoryEntity>,
    @InjectRepository(TransactionRegistrationEntity)
    private readonly transactionRegistrationRepository: Repository<TransactionRegistrationEntity>,
    @InjectRepository(BalanceRollbackEntity)
    private readonly balanceRollbackRepository: Repository<BalanceRollbackEntity>,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
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
      const batchSize = 50;

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
            statuses: [BalanceRollbackStatusEnum.New],
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
        'balanceRollback',
        balanceRollback.transaction.id,
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
    } catch (error: any) {
      await this.balanceRollbackRepository.update(
        { id: balanceRollback.id },
        {
          statusId:
            error.message === 'BALANCE_ROLLBACK'
              ? BalanceRollbackStatusEnum.New
              : BalanceRollbackStatusEnum.Error,
          errorMessage: error.message,
        },
      );
    }
  }
}
