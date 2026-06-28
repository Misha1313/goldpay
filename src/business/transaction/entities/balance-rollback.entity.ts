import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TransactionStatusEntity } from './transaction-status.entity';
import { BalanceRollbackStatusEntity } from './balance-rollback-status.entity';
import { TransactionEntity } from './transaction.entity';

@Entity({
  name: 'balance_rollback',
})
export class BalanceRollbackEntity {
  @PrimaryColumn()
  transactionId: string;

  @PrimaryColumn()
  transactionDate: Date;

  @Index()
  @Column()
  statusId: number;

  @Column({ nullable: true, type: 'numeric', precision: 20, scale: 2 })
  amount: number;

  @Column({ nullable: true })
  errorCode: string;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: 0 })
  tryCount: number;

  @ManyToOne((type) => BalanceRollbackStatusEntity)
  @JoinColumn({ name: 'status_id' })
  status: BalanceRollbackStatusEntity;

  @OneToOne(() => TransactionEntity)
  @JoinColumn([
    { name: 'transaction_id', referencedColumnName: 'id' },
    { name: 'transaction_date', referencedColumnName: 'createdAt' },
  ])
  transaction: TransactionEntity;
}
