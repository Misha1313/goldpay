import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule as NestTypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { migrations } from './migrations';

@Module({
  imports: [
    NestTypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        return {
          type: 'postgres',
          schema: 'public',
          host: configService.get('DB_POSTGRES_HOST'),
          port: configService.get('DB_POSTGRES_PORT'),
          username: configService.get('DB_POSTGRES_USERNAME'),
          password: configService.get('DB_POSTGRES_PASSWORD'),
          database: configService.get('DB_POSTGRES_DATABASE'),
          namingStrategy: new SnakeNamingStrategy(),
          autoLoadEntities: true,
          synchronize: false,
          migrationsRun: true,
          migrations,
          // ssl: {
          //   rejectUnauthorized: false, // required for AWS RDS
          // },
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
