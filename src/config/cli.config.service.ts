import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';

config({
  path: `src/config/envs/.env`,
});

export const configService = new ConfigService();
