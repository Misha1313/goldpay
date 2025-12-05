import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { catchError, firstValueFrom, Observable } from 'rxjs';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  constructor(private readonly httpService: HttpService) {}

  async findAll(): Promise<any[]> {
    const { data } = await firstValueFrom(
      this.httpService.post<any[]>('http://localhost:3000/cats').pipe(
        catchError((error: AxiosError) => {
          this.logger.error(error.response.data);
          throw 'An error happened!';
        }),
      ),
    );
    return data;
  }

  getHello(): string {
    return 'Hello World!';
  }

  async getDrivers() {
    const url =
      'https://fleet-api.taxi.yandex.net/v1/parks/driver-profiles/list';

    const payload = {
      query: {
        park: {
          id: '4d98e8bc5e1b4787885eeb3dcfaa7cd1',
          driver_profile: {
            work_status: ['working'],
          },
        },
      },
      fields: {
        car: [],
        // park: [],
        driver_profile: ['first_name', 'last_name', 'id'],
        account: ['id', 'balance', 'balance_limit', 'currency'],
      },
      sort_order: [
        {
          direction: 'asc',
          field: 'driver_profile.created_date',
        },
      ],
      limit: 200,
      offset: 0,
    };

    const headers = {
      'X-API-Key': 'pIFadyQBjayCgWhNpCcQIPSMOpZPnPOeFrKI',
      'X-Client-ID': 'taxi/park/4d98e8bc5e1b4787885eeb3dcfaa7cd1',
      'X-Park-ID': '4d98e8bc5e1b4787885eeb3dcfaa7cd1',
    };

    const config: AxiosRequestConfig = {
      headers,
      timeout: 5000, // optional
    };

    try {
      const response = await axios.post(url, payload, config);
      return response.data;
    } catch (error) {
      console.error('POST request failed:', error.message);
      throw error;
    }
  }
}
