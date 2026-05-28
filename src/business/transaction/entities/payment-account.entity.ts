import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TransactionStatusEntity } from './transaction-status.entity';

@Entity({
  name: 'payment_account',
  schema: 'public',
})
@Unique(['parkId', 'driverId', 'iban'])
export class PaymentAccountEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  parkId: string;

  @Column({ nullable: true })
  driverId: string;

  @Column()
  iban: string;

  @Column()
  receiverFirstName: string;

  @Column()
  receiverLastName: string;

  @Column({ default: false })
  default: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
