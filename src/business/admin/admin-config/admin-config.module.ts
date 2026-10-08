import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminConfigEntity } from './entities/admin-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AdminConfigEntity])],
  exports: [TypeOrmModule],
})
export class AdminConfigModule {}
