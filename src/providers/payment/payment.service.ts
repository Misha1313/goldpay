import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig } from 'axios';
import { createHash } from 'crypto';
import { TransactionCurrencyEnum } from 'src/business/transaction/enums/transaction-curreny.enum';
import { TransactionServiceEnum } from 'src/business/transaction/enums/transaction-service.enum';
import { WithdrawRequest } from 'src/business/transaction/requests/withdraw.request';

export type DriversProfilesQuery = {
  id: string;
  driver_profile?: {
    phones?: string[];
  };
};

type InfoRequest = {
  amount: number;
  service_id: number;
  currency_id: number;
  transaction_id: string;
  service_params: {
    iban: string;
    receiver_firstname: string;
    receiver_lastname: string;
    sender_firstname: string;
    sender_lastname: string;
    personal_number: string;
  };
  instrument_id: number;
  additional_info: string;
};

type InfoResponse = {
  errorCode: number;
  errorMessage: string;
  version: string;
  request_date: string;
  response_date: string;
};

export type PayResponse = {
  errorCode: number;
  errorMessage: string;
  version: string;
  request_date: string;
  response_date: string;
  data?: {
    id: number;
    status: number;
  };
};

type PayCheckResponse = {
  errorCode: number;
  errorMessage: string;
  version: string;
  request_date: string;
  response_date: string;
  data?: {
    id: number;
    transaction_id: string;
    status: number;
    message?: {
      GE: string;
      EN: string;
      RU: string;
    };
  };
};

@Injectable()
export class PaymentService {
  constructor(private readonly configService: ConfigService) {}

  async info(
    iban: string,
    firstName: string,
    lastName: string,
    amount: number,
    transactionId: string,
  ): Promise<InfoResponse> {
    const url = this.configService.get<string>('PAYMENT_INFO_URL');

    const payload: InfoRequest = {
      amount: amount,
      service_id: this.getServiceId(iban),
      currency_id: TransactionCurrencyEnum.Gel,
      transaction_id: transactionId,
      service_params: {
        iban: iban,
        receiver_firstname: firstName,
        receiver_lastname: lastName,
        sender_firstname: this.configService.get<string>(
          'PAYMENT_SENDER_FIRST_NAME',
        ),
        sender_lastname: this.configService.get<string>(
          'PAYMENT_SENDER_LAST_NAME',
        ),
        personal_number: this.configService.get<string>(
          'PAYMENT_SENDER_PERSONAL_NUMBER',
        ),
      },
      instrument_id: 9,
      additional_info: null,
    };
    const requestDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

    console.log('payload', payload);

    console.log('requestDate', requestDate);

    const hash = this.getHash(payload, requestDate);

    console.log('hash', hash);

    const headers = this.getHeaders(requestDate, hash);

    const config: AxiosRequestConfig = {
      headers,
      timeout: this.configService.get<number>('PAYMENT_REQUEST_TIMEOUT'),
    };

    try {
      const response = await axios.post(url, payload, config);

      return response.data;
    } catch (error) {
      console.error('payment info request failed:', error);
      throw error;
    }
  }

  async pay(
    iban: string,
    firstName: string,
    lastName: string,
    amount: number,
    transactionId: string,
  ): Promise<PayResponse> {
    const url = this.configService.get<string>('PAYMENT_PAY_URL');

    const payload: InfoRequest = {
      amount: amount,
      service_id: this.getServiceId(iban),
      currency_id: TransactionCurrencyEnum.Gel,
      transaction_id: transactionId,
      service_params: {
        iban: iban,
        receiver_firstname: firstName,
        receiver_lastname: lastName,
        sender_firstname: this.configService.get<string>(
          'PAYMENT_SENDER_FIRST_NAME',
        ),
        sender_lastname: this.configService.get<string>(
          'PAYMENT_SENDER_LAST_NAME',
        ),
        personal_number: this.configService.get<string>(
          'PAYMENT_SENDER_PERSONAL_NUMBER',
        ),
      },
      instrument_id: 9,
      additional_info: null,
    };
    const requestDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

    console.log('payload', payload);

    const hash = this.getHash(payload, requestDate);

    console.log('hash', hash);

    const headers = this.getHeaders(requestDate, hash);

    const config: AxiosRequestConfig = {
      headers,
      timeout: this.configService.get<number>('PAYMENT_REQUEST_TIMEOUT'),
    };

    try {
      const response = await axios.post(url, payload, config);

      return response.data;
    } catch (error) {
      console.error('payment pay request failed:', error);
      throw error;
    }
  }

  async payCheck(transactionId: string): Promise<PayCheckResponse> {
    const url = this.configService.get<string>('PAYMENT_PAY_CHECK_URL');

    const payload = {
      transaction_id: transactionId,
    };
    const requestDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const hash = this.getHash(payload, requestDate);

    console.log('hash', hash);

    const headers = this.getHeaders(requestDate, hash);

    const config: AxiosRequestConfig = {
      headers,
      timeout: this.configService.get<number>('PAYMENT_REQUEST_TIMEOUT'),
    };

    try {
      const response = await axios.post(url, payload, config);
      return response.data;
    } catch (error) {
      console.error('payment pay check request failed:', error);
      throw error;
    }
  }

  private getHash(payload: any, requestDate: string) {
    const hashString =
      JSON.stringify(payload) +
      this.configService.get<string>('PAYMENT_WALLET') +
      this.configService.get<string>('PAYMENT_BEARER_TOKEN') +
      this.configService.get<string>('PAYMENT_SECRET') +
      requestDate;

    const hash = createHash('sha512').update(hashString).digest('hex');

    return hash;
  }

  private getHeaders(requestDate: string, hash: string) {
    const headers = {
      requestDate,
      hash,
      wallet: this.configService.get<string>('PAYMENT_WALLET'),
      Authorization: `Bearer ${this.configService.get<string>('PAYMENT_BEARER_TOKEN')}`,
    };

    return headers;
  }

  private getServiceId(iban: string) {
    const bankCode = iban.replace(/\s/g, '').toUpperCase().slice(4, 6);

    switch (bankCode) {
      case 'TB':
        return TransactionServiceEnum.Tbc;

      case 'BG':
        return TransactionServiceEnum.Bog;

      case 'LB':
        return TransactionServiceEnum.Liberty;
    }
  }
}
