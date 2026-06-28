import {
  Column,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({
  name: 'payment_log',
})
export class PaymentLogEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @PrimaryColumn()
  createdAt: Date;

  @Column({ nullable: true })
  transactionId: string;

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
}
