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
  name: 'transaction_status',
  schema: 'public',
})
export class TransactionStatusEntity {
  @PrimaryColumn()
  id: number;

  @Column()
  name: string;
}
