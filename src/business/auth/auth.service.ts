import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { DriverService } from '../driver/driver.service';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthOtpCodeEntity } from './entities/auth-otp-code.entity';
import { Repository } from 'typeorm';
import { differenceInSeconds } from 'date-fns';
import { AuthEntity } from './entities/auth.entity';
import { SmsService } from 'src/providers/sms/sms.service';
import { ConfigService } from '@nestjs/config';

export type JwtPayload = {
  sub: string;
  sessionId: number;
  roleId: number;
  parkId: string;
  type: string;
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
};

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private readonly driverService: DriverService,
    @InjectRepository(AuthOtpCodeEntity)
    private readonly authOtpCodeRepository: Repository<AuthOtpCodeEntity>,
    @InjectRepository(AuthEntity)
    private readonly authRepository: Repository<AuthEntity>,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
  ) {}

  async login(user: AuthOtpCodeEntity): Promise<LoginResponse> {
    const authObject = this.authRepository.create({
      parkId: user.parkId,
      driverId: user.driverId,
      phoneNumber: user.phoneNumber,
      roleId: user.roleId,
    });

    const authEntity = await this.authRepository.save(authObject);

    const accessPayload: JwtPayload = {
      sub: user.driverId,
      sessionId: authEntity.id,
      roleId: user.roleId,
      parkId: user.parkId,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: user.driverId,
      sessionId: authEntity.id,
      roleId: user.roleId,
      parkId: user.parkId,
      type: 'refresh',
    };

    return {
      access_token: await this.jwtService.signAsync(accessPayload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<number>('JWT_ACCESS_EXPIRES_IN'),
      }),
      refresh_token: await this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<number>('JWT_REFRESH_EXPIRES_IN'),
      }),
    };
  }

  async sendOtp(sendOtpDto: SendOtpDto) {
    // check if phone number exists. different for driver and admin. that part I should take to driver and admin services
    // done for driver

    const driverInfo = await this.driverService.getDriverByPhone(
      sendOtpDto.phoneNumber,
      sendOtpDto.parkId,
    );

    if (!driverInfo?.driver_profile)
      throw new UnauthorizedException('Invalid credentials');

    const Otp = this.generateOtp();

    await this.smsService.sendSms(
      sendOtpDto.phoneNumber.slice(1),
      `ავტორიზაციის კოდი: ${Otp}`,
    );

    const authOtpCodeEntity = this.authOtpCodeRepository.create({
      parkId: driverInfo.parkId,
      driverId: driverInfo.driver_profile.id,
      phoneNumber: sendOtpDto.phoneNumber,
      roleId: sendOtpDto.roleId,
      code: Otp,
    });

    await this.fillOtpCode(authOtpCodeEntity);
  }

  async refresh(JwtPayload: JwtPayload) {
    const accessPayload: JwtPayload = {
      sub: JwtPayload.sub,
      sessionId: JwtPayload.sessionId,
      roleId: JwtPayload.roleId,
      parkId: JwtPayload.parkId,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: JwtPayload.sub,
      sessionId: JwtPayload.sessionId,
      roleId: JwtPayload.roleId,
      parkId: JwtPayload.parkId,
      type: JwtPayload.type,
    };

    return {
      access_token: await this.jwtService.signAsync(accessPayload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<number>('JWT_ACCESS_EXPIRES_IN'),
      }),
      refresh_token: await this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<number>('JWT_REFRESH_EXPIRES_IN'),
      }),
    };
  }

  async validateUser(email: string, pass: string): Promise<any> {
    // const user = await this.userService.findOneByEmail(email);

    // if (!user) {
    //   console.log('no user');
    //   return null;
    // }

    // const isMatch = await bcrypt.compare(pass, user?.password);

    // if (!isMatch) {
    //   console.log('passwords do not match');
    //   return null;
    // }
    // const { password, ...result } = user;

    // return result;
    return {};
  }

  async validateOtp(
    phoneNumber: string,
    code: string,
    roleId: number,
    parkId: string,
  ): Promise<AuthOtpCodeEntity> {
    const driver = await this.authOtpCodeRepository.findOneBy({
      phoneNumber,
      roleId,
      parkId,
    });

    if (differenceInSeconds(new Date(), driver.updatedAt) > 60) {
      console.log('Otp is outdated');
      return null;
    }

    if (code !== driver?.code) {
      console.log('Passwords do not match');
      return null;
    }

    return driver;
  }

  async register(data: RegisterDto) {
    // const user = await this.userService.findOneByEmail(data.email);
    // if (user) {
    //   throw new ConflictException('Email is already in use');
    // }
    // const hash = await bcrypt.hash(
    //   data.password,
    //   Number(this.configService.get<number>('HASH_ROUNDS')),
    // );
    // return this.userService.create({ ...data, password: hash });
    return 'Success!';
  }

  private generateOtp() {
    return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  }

  private async fillOtpCode(entity: AuthOtpCodeEntity) {
    const existingEntity = await this.authOtpCodeRepository.findOneBy({
      parkId: entity.parkId,
      driverId: entity.driverId,
    });

    if (!existingEntity) {
      await this.authOtpCodeRepository.insert(entity);
    } else {
      existingEntity.code = entity.code;
      await this.authOtpCodeRepository.save(existingEntity);
    }
  }

  async getAuthById(id: number) {
    return this.authRepository.findOneBy({ id });
  }

  async logout(JwtPayload: JwtPayload) {
    return this.authRepository.update(
      { id: JwtPayload.sessionId },
      { logoutDate: new Date() },
    );
  }
}
