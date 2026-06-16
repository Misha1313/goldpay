import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({
  name: 'balance_rollback_status',
})
export class BalanceRollbackStatusEntity {
  @PrimaryColumn()
  id: number;

  @Column()
  name: string;
}
