import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({
  name: 'auth',
  schema: 'auth',
})
export class AuthEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  createdAt: Date;

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

  @BeforeInsert()
  updateDates() {
    console.log('auth insert dates');
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  @BeforeUpdate()
  setUpdateDate() {
    console.log('auth update dates');
    this.updatedAt = new Date();
  }
}
