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

export type JwtPayload = {
  sub: string;
  roleId: number;
  parkId: string;
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
  ) {}

  async login(user: AuthOtpCodeEntity): Promise<any> {
    const payload: JwtPayload = {
      sub: user.driverId,
      roleId: user.roleId,
      parkId: user.parkId,
    };

    const authEntity = this.authRepository.create({
      parkId: user.parkId,
      driverId: user.driverId,
      phoneNumber: user.phoneNumber,
      roleId: user.roleId,
    });

    await this.authRepository.save(authEntity);

    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async sendOtp(sendOtpDto: SendOtpDto) {
    // check if phone number exists. different for driver and admin. that part I should take to driver and admin services
    // done for driver

    const driverInfo = await this.driverService.getDriverByPhone(
      sendOtpDto.phoneNumber,
      sendOtpDto.parkId,
    );

    console.log('driverInfo', driverInfo);

    if (!driverInfo) throw new UnauthorizedException('Invalid credentials');

    const Otp = this.generateOtp();

    await this.smsService.sendSms(
      sendOtpDto.phoneNumber.slice(1),
      `ავტორიზაციის კოდი: ${Otp}`,
    );

    console.log('sms', sendOtpDto.phoneNumber.slice(1), Otp);

    const authOtpCodeEntity = this.authOtpCodeRepository.create({
      parkId: driverInfo.parkId,
      driverId: driverInfo.driver_profile.id,
      phoneNumber: sendOtpDto.phoneNumber,
      roleId: sendOtpDto.roleId,
      code: Otp,
    });

    await this.fillOtpCode(authOtpCodeEntity);

    return Otp;
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

    console.log('driver otp', driver, phoneNumber);

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
}
