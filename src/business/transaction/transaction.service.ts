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
import { ConfigService } from '@nestjs/config';
import { TransactionStatusEnum } from './enums/transaction-status.enum';
import { format, subHours } from 'date-fns';
import { PaymentAccountEntity } from './entities/payment-account.entity';
import { GetTransactionsRequest } from './requests/get-transactions.request';
import { JwtPayload } from '../auth/auth.service';
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

    await this.fillTransactionRegistration(driverId, parkId);

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

    try {
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
        await this.transactionRegistrationRepository.delete({
          driverId,
          parkId,
        });
        return;
      }

      const updateBalanceResponse =
        await this.yandexService.updateDriverBalance(
          parkId,
          driverId,
          -request.amount,
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
      if (
        [
          'TRANSACTION_IN_PROGRESS',
          'TOO_MANY_REQUESTS',
          'INSUFFICIENT_BALANCE',
        ].includes(error.message)
      ) {
        throw error;
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
