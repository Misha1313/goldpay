import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JobConfigEntity } from './job-config.entity';
import { JobRunningStatusEntity } from './job-running-status.entity';

@Entity({
  name: 'job_running_history'
})
export class JobRunningHistoryEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  configKey: string;

  @Column()
  statusId: number;

  @PrimaryColumn()
  startDate: Date;

  @UpdateDateColumn({ nullable: true })
  endDate: Date;

  @Column({ nullable: true })
  error: string;

  @ManyToOne((type) => JobConfigEntity)
  @JoinColumn({ name: 'config_key' })
  config: JobConfigEntity;

  @ManyToOne((type) => JobRunningStatusEntity)
  @JoinColumn({ name: 'status_id' })
  status: JobRunningStatusEntity;
}
