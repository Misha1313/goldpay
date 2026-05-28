import { Injectable } from '@nestjs/common';
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

@Injectable()
export class TransactionService {
  constructor(
    private readonly yandexService: YandexService,
    private readonly paymentService: PaymentService,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    private readonly configService: ConfigService,
    @InjectRepository(PaymentAccountEntity)
    private readonly paymentAccountRepository: Repository<PaymentAccountEntity>,
  ) {}

  async withdrawBalance(request: WithdrawRequest, jwtPayload: JwtPayload) {
    const transactionId = uuidv4();
    const { sub: driverId, parkId } = jwtPayload;

    // const updateBalanceResponse = await this.updateDriverBalance(
    //   parkId,
    //   driverId,
    //   request.amount,
    // );

    // return;

    const getBalanceResponse =
      await this.yandexService.getDriverBalance(driverId);

    // TODO - send error code
    if (getBalanceResponse.balance < request.amount) {
      console.log('incorrect balance');
      return;
    }

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
      updatedAt: new Date(),
    });
    const newTransactionEntity =
      await this.transactionRepository.save(newTransactionObject);

    const infoResponse = await this.paymentService.info(
      request.iban,
      request.firstName,
      request.lastName,
      request.amount,
      transactionId,
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
      return;
    }

    // substract transaction amount from yandex balance
    try {
      const updateBalanceResponse = await this.updateDriverBalance(
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
        transactionId,
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
        await this.updateDriverBalance(parkId, driverId, request.amount);
      }
    } catch (error: any) {
      console.log(error);
      if (error?.message === 'balance update') {
        console.log('balance error', error?.cause?.response?.data);
        await this.transactionRepository.update(
          { id: newTransactionEntity.id },
          {
            statusId: TransactionStatusEnum.Cancell,
            balanceUpdateErrorCode: error?.cause?.response?.data?.code,
            balanceUpdateErrorMessage: error?.cause?.response?.data?.message,
          },
        );
      } else {
        await this.transactionRepository.update(
          { id: newTransactionEntity.id },
          {
            statusId: TransactionStatusEnum.Cancell,
          },
        );
      }
    }
  }

  private async executePay(
    request: Partial<WithdrawRequest>,
    transactionId: string,
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

  private async updateDriverBalance(
    parkId: string,
    driverId: string,
    amount: number,
  ) {
    const retries = Number(this.configService.get<number>('RETRY_NUMBER'));
    const delayMs = Number(this.configService.get<number>('RETRY_INTERVAL'));

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const updateBalanceId = uuidv4();
        const updateBalanceResponse =
          await this.yandexService.updateDriverBalance(
            parkId,
            driverId,
            amount,
            updateBalanceId,
          );

        return updateBalanceResponse;
      } catch (error: any) {
        console.log('update driver balance error', error?.message);
        if (attempt === retries) {
          throw new Error('balance update', {
            cause: error,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
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
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handlePendingTransactions() {
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

      if (transactions.length === 0) return;

      await Promise.all(transactions.map((row) => this.payCheck(row)));

      offset += batchSize;
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
        payCheckResponse.errorCode === 0,
      );

      // transaction did not reach provider. It needs to be repeated
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
          await this.updateDriverBalance(
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

        return;
      }

      console.log('not success');

      // transaction failed
      await this.updateDriverBalance(
        transaction.parkId,
        transaction.driverId,
        transaction.amount,
      );

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

  async getPaymentAccounts(request: GetPaymentAccountsRequest) {
    return this.paymentAccountRepository.findBy({
      parkId: request.parkId,
      driverId: request.driverId,
    });
  }

  async getTransactions(request: GetTransactionsRequest) {
    return (
      this.transactionRepository
        .createQueryBuilder('transaction')
        .select([
          'transaction.createdAt',
          'transaction.amount',
          'transaction.statusId',
          'transaction.iban',
        ])
        .where('transaction.parkId = :parkId', { parkId: request.parkId })
        .andWhere('transaction.driverId = :driverId', {
          driverId: request.driverId,
        })
        .orderBy('transaction.createdAt')
        .take(60)
        // .take(request.take)
        // .skip(request.skip)
        .getMany()
    );
  }
}
