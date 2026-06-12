import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity({
  name: 'job_running_status'
})
export class JobRunningStatusEntity {
  @PrimaryColumn()
  id: number;

  @Column()
  name: string;
}
