import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({
  name: 'otp_code',
  schema: 'auth',
})
@Unique(['parkId', 'driverId'])
export class AuthOtpCodeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  updatedAt: Date;

  @Column()
  parkId: string;

  @Column({ nullable: true })
  driverId: string;

  @Column()
  phoneNumber: string;

  @Column()
  roleId: number;

  @Column()
  code: string;

  @BeforeInsert()
  updateDates() {
    console.log('otp code insert');
    this.updatedAt = new Date();
  }

  @BeforeUpdate()
  setUpdateDate() {
    console.log('otp code update');
    this.updatedAt = new Date();
  }
}
