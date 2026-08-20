import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from './decorators/public.decorator';
import { RegisterDto } from './dto/register.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { PhoneOtpAuthGuard } from './guards/phone-otp-auth.guard';
import { LoginOtpDto } from './dto/login-otp.dto';
import { ConfigService } from '@nestjs/config';
import { JwtAuthRefreshGuard } from './guards/jwt-auth-refresh.guard';
import { addSeconds } from 'date-fns';

@Controller('auth')
@ApiTags('Auth')
@ApiBearerAuth()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  // @UseGuards(LocalAuthGuard)
  @Post('send-otp')
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendOtp(sendOtpDto);
  }

  @Public()
  @UseGuards(PhoneOtpAuthGuard)
  @Post('login-otp')
  async login(
    @Body() loginOtpDto: LoginOtpDto,
    @Req() req,
    @Res({ passthrough: true }) res,
  ) {
    const { access_token, refresh_token } = await this.authService.login(
      req.user,
    );

    const refreshJwtExpiresInString = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );

    res.cookie('refreshToken', refresh_token, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: 'auth',
      expires: addSeconds(
        new Date(),
        Number(refreshJwtExpiresInString.slice(0, -1)),
      ),
    });

    return { access_token };
  }

  @Post('refresh')
  @Public()
  @UseGuards(JwtAuthRefreshGuard)
  async refreshJwt(@Req() req, @Res({ passthrough: true }) res) {
    if (!req.user?.sessionId) {
      throw new UnauthorizedException();
    }

    const authEntity = await this.authService.getAuthById(req.user.sessionId);

    if (!authEntity) {
      throw new UnauthorizedException();
    }

    const { access_token, refresh_token } = await this.authService.refresh(
      req.user,
    );

    const refreshJwtExpiresInString = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );

    res.cookie('refreshToken', refresh_token, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: 'auth',
      expires: addSeconds(
        authEntity.createdAt,
        Number(refreshJwtExpiresInString.slice(0, -1)),
      ),
    });

    return { access_token };
  }

  @Public()
  @Post('register')
  signUp(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }
}
