import { Injectable, NotFoundException } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';

export type DriversProfilesQuery = {
  id: string;
  driver_profile?: {
    phones?: string[];
  };
};

@Injectable()
export class YandexService {
  async getDriverBalance(driverId: string) {
    const url = `https://fleet-api.taxi.yandex.net/v1/parks/contractors/blocked-balance?contractor_id=${driverId}`;

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

  async getDriverProfile(driverId: string) {
    const url = `https://fleet-api.taxi.yandex.net/v2/parks/contractors/driver-profile?contractor_profile_id=${driverId}`;

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
      limit: 3,
    };

    const headers = {
      'X-API-Key': 'pIFadyQBjayCgWhNpCcQIPSMOpZPnPOeFrKI',
      'X-Client-ID': 'taxi/park/4d98e8bc5e1b4787885eeb3dcfaa7cd1',
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
