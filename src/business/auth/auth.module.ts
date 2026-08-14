import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PhoneOtpStrategy } from './strategies/phone-otp.strategy';
import { YandexModule } from 'src/providers/yandex/yandex.module';
import { DriverModule } from '../driver/driver.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthEntity } from './entities/auth.entity';
import { AuthOtpCodeEntity } from './entities/auth-otp-code.entity';
import { SmsModule } from 'src/providers/sms/sms.module';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtAuthRefreshGuard } from './guards/jwt-auth-refresh.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuthEntity, AuthOtpCodeEntity]),
    DriverModule,
    PassportModule,
    YandexModule,
    ConfigModule,
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        // secret: configService.get<string>('JWT_SECRET'),
        // signOptions: {
        //   expiresIn: configService.get<number>('JWT_EXPIRES_IN') || 3600,
        // },
      }),
    }),
    SmsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    PhoneOtpStrategy,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    JwtRefreshStrategy,
    JwtAuthRefreshGuard,
  ],
  exports: [AuthService],
})
export class AuthModule {}
