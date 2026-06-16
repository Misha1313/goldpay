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
  name: 'transaction_registration',
})
export class TransactionRegistrationEntity {
  @PrimaryColumn()
  parkId: string;

  @PrimaryColumn()
  driverId: string;

  @CreateDateColumn()
  createdAt: Date;
}
