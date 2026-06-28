import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosRequestConfig } from 'axios';
import { WithdrawRequest } from 'src/business/transaction/requests/withdraw.request';
import { v4 as uuidv4 } from 'uuid';
import { YandexLogEntity } from './yandex-log.entity';
import { Repository } from 'typeorm';
import { DriverBalanceUpdateDescriptionEnum } from 'src/business/common/enums/driver-balance-update-description.enum';
import { AppError } from 'src/business/utils/app-error';

export type DriversProfilesQuery = {
  id: string;
  driver_profile?: {
    phones?: string[];
  };
};

export type GetDriverProfileResponse = {
  person: {
    full_name: {
      first_name: string;
      last_name: string;
    };
  };
};

export type GetDriverBalanceResponse = {
  balance: number;
  blocked_balance: number;
};

export type UpdateDriverBalanceErrorResponse = {
  code: string;
  message: string;
};

export type GetTransactionsResponse = {
  transactions: [
    {
      id: string;
      event_at: string;
      category_id: string;
      category_name: string;
      amount: string;
      currency_code: string;
      description: string;
      created_by: {
        identity: string;
        passport_uid: string;
        dispatcher_id: string;
        dispatcher_name: string;
      };
      driver_profile_id: string;
      order_id: string;
      event_id: string;
    },
  ];
  limit: number;
  cursor: string;
};

@Injectable()
export class YandexService {
  private X_API_KEY = this.configService.get<string>('X_API_KEY');
  private X_CLIENT_ID = this.configService.get<string>('X_CLIENT_ID');
  private X_PARK_ID = this.configService.get<string>('X_PARK_ID');

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(YandexLogEntity)
    private readonly yandexLogRepository: Repository<YandexLogEntity>,
  ) {}

  async getDriverBalance(
    driverId: string,
    process: string,
    transactionId?: string,
  ) {
    const retries = Number(this.configService.get<number>('RETRY_NUMBER'));
    const delayMs = Number(this.configService.get<number>('RETRY_INTERVAL'));

    const yandexLogObject = this.yandexLogRepository.create({
      createdAt: new Date(),
      driverId,
      process,
      method: 'getDriverBalance',
      request: { driverId },
      transactionId,
      parkId: this.X_PARK_ID,
    });
    const yandexLogEntity =
      await this.yandexLogRepository.save(yandexLogObject);

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const url = `https://fleet-api.taxi.yandex.net/v1/parks/contractors/blocked-balance?contractor_id=${driverId}`;

        const headers = {
          'X-API-Key': this.X_API_KEY,
          'X-Client-ID': this.X_CLIENT_ID,
          'X-Park-ID': this.X_PARK_ID,
        };

        const config: AxiosRequestConfig = {
          headers,
          timeout: 10000, // optional
        };

        const response = await axios.get(url, config);

        console.log('getDriverBalanceResponse', response.data);

        await this.yandexLogRepository.update(
          { id: yandexLogEntity.id },
          {
            response: response.data,
            httpStatus: response.status,
          },
        );

        return response.data;
      } catch (error: any) {
        console.log('getDriverBalance error:', error.message);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        await this.yandexLogRepository.update(
          { id: yandexLogEntity.id },
          {
            error: error.message,
            httpStatus: error.response?.status,
          },
        );
        throw new AppError(error.message, 'GET_DRIVER_BALANCE');
      }
    }
  }

  async getDriverProfile(driverId: string): Promise<GetDriverProfileResponse> {
    const url = `https://fleet-api.taxi.yandex.net/v2/parks/contractors/driver-profile?contractor_profile_id=${driverId}`;

    const headers = {
      'X-API-Key': this.X_API_KEY,
      'X-Client-ID': this.X_CLIENT_ID,
      'X-Park-ID': this.X_PARK_ID,
    };

    const config: AxiosRequestConfig = {
      headers,
      timeout: 10000, // optional
    };

    try {
      const response = await axios.get(url, config);
      return response.data;
    } catch (error: any) {
      console.error('getDriverBalance request failed:', error.response?.data);
      if (error.response?.status === 404) {
        throw new NotFoundException('Contractor not found');
      }
      throw error;
    }
  }

  async getDriversProfiles(query: DriversProfilesQuery) {
    const url =
      'https://fleet-api.taxi.yandex.net/v1/parks/driver-profiles/list';

    const payload = {
      query: {
        park: query,
      },
    };

    const headers = {
      'X-API-Key': this.X_API_KEY,
      'X-Client-ID': this.X_CLIENT_ID,
    };

    const config: AxiosRequestConfig = {
      headers,
      timeout: 10000, // optional
    };

    try {
      const response = await axios.post(url, payload, config);
      return response.data;
    } catch (error: any) {
      console.error('POST request failed:', error.message);
      throw error;
    }
  }

  async updateDriverBalance(
    parkId: string,
    driverId: string,
    amount: number,
    process: string,
    transactionId?: string,
  ) {
    const retries = Number(this.configService.get<number>('RETRY_NUMBER'));
    const delayMs = Number(this.configService.get<number>('RETRY_INTERVAL'));

    const payload = {
      park_id: parkId,
      driver_profile_id: driverId,
      category_id: 'partner_service_manual',
      amount: amount.toString(),
      description:
        amount < 0
          ? DriverBalanceUpdateDescriptionEnum.BalanceWithdrawal
          : DriverBalanceUpdateDescriptionEnum.BalanceRollback,
    };

    const yandexLogObject = this.yandexLogRepository.create({
      createdAt: new Date(),
      driverId,
      process,
      method: 'updateDriverBalance',
      request: payload,
      transactionId,
      parkId: this.X_PARK_ID,
    });
    const yandexLogEntity =
      await this.yandexLogRepository.save(yandexLogObject);

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const updateBalanceId = uuidv4();

        const url =
          'https://fleet-api.taxi.yandex.net/v2/parks/driver-profiles/transactions';

        const headers = {
          'X-API-Key': this.X_API_KEY,
          'X-Client-ID': this.X_CLIENT_ID,
          'X-Idempotency-Token': updateBalanceId,
        };

        const config: AxiosRequestConfig = {
          headers,
          timeout: 15000, // optional
        };

        const response = await axios.post(url, payload, config);

        await this.yandexLogRepository.update(
          { id: yandexLogEntity.id },
          {
            response: response.data,
            httpStatus: response.status,
          },
        );

        return response.data;
      } catch (error: any) {
        console.log('update driver balance error', error?.message);
        if (attempt === retries) {
          await this.yandexLogRepository.update(
            { id: yandexLogEntity.id },
            {
              error: error.message,
              httpStatus: error.response?.status,
            },
          );
          const errorCode =
            amount < 0 ? 'BALANCE_WITHDRAWAL' : 'BALANCE_ROLLBACK';
          throw new AppError(error.message, errorCode);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async getTransactions(
    driverId: string,
    dateFrom: Date,
    dateTo: Date,
    process: string,
    transactionId: string,
  ): Promise<GetTransactionsResponse> {
    const url =
      'https://fleet-api.taxi.yandex.net/v2/parks/driver-profiles/transactions/list';

    const payload = {
      query: {
        park: {
          id: this.X_PARK_ID,
          driver_profile: {
            id: driverId,
          },
          transaction: {
            event_at: {
              from: dateFrom,
              to: dateTo,
            },
          },
        },
      },
    };

    const yandexLogObject = this.yandexLogRepository.create({
      createdAt: new Date(),
      driverId,
      process,
      method: 'getTransactions',
      request: payload,
      transactionId,
      parkId: this.X_PARK_ID,
    });
    const yandexLogEntity =
      await this.yandexLogRepository.save(yandexLogObject);

    const headers = {
      'X-API-Key': this.X_API_KEY,
      'X-Client-ID': this.X_CLIENT_ID,
    };

    const config: AxiosRequestConfig = {
      headers,
      timeout: 10000, // optional
    };

    try {
      const response = await axios.post(url, payload, config);
      await this.yandexLogRepository.update(
        { id: yandexLogEntity.id },
        {
          response: response.data,
          httpStatus: response.status,
        },
      );
      return response.data;
    } catch (error: any) {
      console.error('POST request failed:', error.message);
      await this.yandexLogRepository.update(
        { id: yandexLogEntity.id },
        {
          error: error.message,
          httpStatus: error.response?.status,
        },
      );
      throw new AppError(error.message, 'GET_TRANSACTIONS');
    }
  }
}
