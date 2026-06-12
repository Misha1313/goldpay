import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobConfigEntity } from './entities/job-config.entity';
import { JobRunningStatusEntity } from './entities/job-running-status.entity';
import { JobRunningHistoryEntity } from './entities/job-running-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JobConfigEntity,
      JobRunningStatusEntity,
      JobRunningHistoryEntity,
    ]),
  ],
  exports: [TypeOrmModule]
})
export class CommonModule {}
