import {
  BeforeInsert,
  BeforeUpdate,
  Column,
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
  id: number;

  @PrimaryColumn()
  createdAt: Date;

  @Index()
  @Column()
  statusId: number;

  @Column({ nullable: true, type: 'numeric', precision: 20, scale: 2 })
  amount: number;

  @Column({ nullable: true })
  errorMessage: string;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne((type) => BalanceRollbackStatusEntity)
  @JoinColumn({ name: 'status_id' })
  status: BalanceRollbackStatusEntity;

  @OneToOne(() => TransactionEntity)
  @JoinColumn([
    { name: 'id', referencedColumnName: 'id' },
    { name: 'created_at', referencedColumnName: 'createdAt' },
  ])
  transaction: TransactionEntity;
}
