import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().required(),
        APP_PORT: Joi.number().required(),

        DB_POSTGRES_HOST: Joi.string().required(),
        DB_POSTGRES_PORT: Joi.string().required(),
        DB_POSTGRES_USERNAME: Joi.string().required(),
        DB_POSTGRES_PASSWORD: Joi.string().required(),
        DB_POSTGRES_DATABASE: Joi.string().required(),
      }),
      envFilePath: [`src/config/envs/.env`],
    }),
  ],
})
export class ConfigModule {}
