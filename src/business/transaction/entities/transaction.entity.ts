import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TransactionStatusEntity } from './transaction-status.entity';

@Entity({
  name: 'transaction',
  schema: 'public',
})
@Index(['parkId', 'driverId'])
export class TransactionEntity {
  @PrimaryColumn()
  id: string;

  @PrimaryColumn()
  createdAt: Date;

  @Column()
  parkId: string;

  @Column({ nullable: true })
  driverId: string;

  @Index()
  @Column()
  statusId: number;

  @Column()
  iban: string;

  @Column()
  receiverFirstName: string;

  @Column()
  receiverLastName: string;

  @Column({ nullable: true, type: 'numeric', precision: 20, scale: 2 })
  amount: number;

  @Column({ nullable: true, type: 'numeric', precision: 20, scale: 2 })
  beforeBalance: number;

  @Column({ nullable: true })
  errorCode: string;

  @Column({ nullable: true })
  errorMessage: string;

  @Column({ type: 'bigint', nullable: true })
  providerTransactionId: number;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne((type) => TransactionStatusEntity)
  @JoinColumn({ name: 'status_id' })
  status: TransactionStatusEntity;
}
