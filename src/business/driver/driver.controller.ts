import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { DriverService } from './driver.service';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('driver')
@ApiBearerAuth()
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Get('balance')
  getDriverBalance(@Req() req) {
    return this.driverService.getDriverBalance(req.user);
  }

  @Get('info')
  getDriverInfo(@Req() req) {
    return this.driverService.getDriverInfo(req.user);
  }
}
