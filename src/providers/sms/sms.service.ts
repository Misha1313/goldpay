import { Injectable, NotFoundException } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { configService } from 'src/config/cli.config.service';

@Injectable()
export class SmsService {
  async sendSms(phoneNumber: string, text: string) {
    const queryParamsObject = {
      key: configService.get<string>('SMS_API_KEY'),
      brandID: configService.get<string>('SMS_BRAND_ID'),
      numbers: phoneNumber,
      text: text,
      stopList: 'false',
      otp: 'true',
    };

    const queryString = new URLSearchParams(queryParamsObject).toString();

    // const queryParams = `key=${apiKey}&brandID=${brandId}&numbers=${phoneNumber}&text=${text}&stopList=false&otp=true`;
    const url = `https://api.ubill.dev/v1/sms/send?${queryString}`;

    const config: AxiosRequestConfig = {
      timeout: 5000, // optional
    };

    try {
      const response = await axios.get(url, config);
      return response.data;
    } catch (error: any) {
      console.error('Sms send request failed:', error.response?.data);
      // if (error.response.status === 404) {
      //   throw new NotFoundException('Contractor not found');
      // }
      throw error;
    }
  }
}
