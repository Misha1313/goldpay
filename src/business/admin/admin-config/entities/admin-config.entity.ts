import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({
  name: 'admin_config',
})
export class AdminConfigEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  createdAt: Date;

  @Column()
  updatedAt: Date;

  @Column()
  parkId: string;

  @Column()
  phoneNumber: string;
}
