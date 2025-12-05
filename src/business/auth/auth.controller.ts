import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from './decorators/public.decorator';
import { RegisterDto } from './dto/register.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { PhoneOtpAuthGuard } from './guards/phone-otp-auth.guard';
import { LoginOtpDto } from './dto/login-otp.dto';

@Controller('auth')
@ApiTags('Auth')
@ApiBearerAuth()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // @UseGuards(LocalAuthGuard)
  @Post('send-otp')
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendOtp(sendOtpDto);
  }

  @Public()
  @UseGuards(PhoneOtpAuthGuard)
  @Post('login-otp')
  async login(@Body() loginOtpDto: LoginOtpDto, @Req() req) {
    return this.authService.login(req.user);
  }

  @Public()
  @Post('register')
  signUp(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }
}
