import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig } from 'axios';
import { WithdrawRequest } from 'src/business/transaction/requests/withdraw.request';

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

@Injectable()
export class YandexService {
  private X_API_KEY = this.configService.get<string>('X_API_KEY');
  private X_CLIENT_ID = this.configService.get<string>('X_CLIENT_ID');
  private X_PARK_ID = this.configService.get<string>('X_PARK_ID');

  constructor(private readonly configService: ConfigService) { }

  async getDriverBalance(driverId: string) {
    const retries = Number(this.configService.get<number>('RETRY_NUMBER'));
    const delayMs = Number(this.configService.get<number>('RETRY_INTERVAL'));

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

        return response.data;
      } catch (error: any) {
        console.log('getDriverBalance error:', error.message);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw error;
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
    } catch (error) {
      console.error('getDriverBalance request failed:', error.response.data);
      if (error.response.status === 404) {
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
      // {
      //   park: {
      //     id: '4d98e8bc5e1b4787885eeb3dcfaa7cd1',
      //     driver_profile: {
      //       work_status: ['working'],
      //     },
      //   },
      // },
      // fields: {
      //   driver_profile: ['first_name', 'last_name', 'id'],
      // },
      // limit: 3,
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
    } catch (error) {
      console.error('POST request failed:', error.message);
      throw error;
    }
  }

  async updateDriverBalance(
    parkId: string,
    driverId: string,
    amount: number,
    token: string,
  ) {
    const url =
      'https://fleet-api.taxi.yandex.net/v2/parks/driver-profiles/transactions';

    const payload = {
      park_id: parkId,
      driver_profile_id: driverId,
      category_id: 'partner_service_manual',
      amount: amount.toString(),
      description: 'withdraw balance',
    };

    const headers = {
      'X-API-Key': this.X_API_KEY,
      'X-Client-ID': this.X_CLIENT_ID,
      'X-Idempotency-Token': token,
    };

    const config: AxiosRequestConfig = {
      headers,
      timeout: 15000, // optional
    };

    try {
      const response = await axios.post(url, payload, config);
      return response.data;
    } catch (error: any) {
      console.error(
        'updateDriverBalance failed:',
        error?.response?.data,
        error?.response?.data?.code,
        error?.response?.data?.message,
      );
      throw error;
    }
  }
}
