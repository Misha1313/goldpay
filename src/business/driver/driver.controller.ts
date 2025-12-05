import { Controller, Get, Param } from '@nestjs/common';
import { DriverService } from './driver.service';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('driver')
@ApiBearerAuth()
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Get('balance/:driverId')
  getDriverBalance(@Param('driverId') driverId: string) {
    return this.driverService.getDriverBalance(driverId);
  }
}
