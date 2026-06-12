import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity({
  name: 'job_config'
})
export class JobConfigEntity {
  @PrimaryColumn()
  key: string;

  @Column()
  active: boolean;
}
