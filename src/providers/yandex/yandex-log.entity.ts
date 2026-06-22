import {
  Column,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({
  name: 'yandex_log',
})
export class YandexLogEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @PrimaryColumn()
  createdAt: Date;

  @Column({ nullable: true })
  transactionId: number;

  @Column({ nullable: true })
  driverId: string;

  @Column({ nullable: true })
  process: string;

  @Column()
  method: string;

  @Column({ nullable: true })
  httpStatus: number;

  @Column({ type: 'jsonb', nullable: true })
  request: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  response: Record<string, any>;

  @Column({ nullable: true })
  error: string;

  @UpdateDateColumn({ nullable: true })
  updatedAt: Date;

  @Column()
  parkId: string;
}
