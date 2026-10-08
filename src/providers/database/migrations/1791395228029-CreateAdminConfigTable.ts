import { AdminConfigEntity } from 'src/business/admin/admin-config/entities/admin-config.entity';
import { configService } from 'src/config/cli.config.service';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminConfigTable1791395228029 implements MigrationInterface {
  name = 'CreateAdminConfigTable1791395228029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "auth"."otp_code" DROP CONSTRAINT "UQ_3d4a13c3a86d25b6dadea11516c"
        `);
    await queryRunner.query(`
            ALTER TABLE "auth"."otp_code"
            ADD CONSTRAINT "UQ_b3c4c0a7ff9b87072359206521c" UNIQUE ("park_id", "phone_number", "role_id")
        `);

    await queryRunner.query(`
            CREATE TABLE "admin_config" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL,
                "updated_at" TIMESTAMP NOT NULL,
                "park_id" character varying NOT NULL,
                "phone_number" character varying NOT NULL,
                CONSTRAINT "PK_c486270cca36cc6c0ee6cf65f74" PRIMARY KEY ("id")
            )
        `);

    const repository = queryRunner.manager.getRepository(AdminConfigEntity);
    const data: Partial<AdminConfigEntity> = {
      createdAt: new Date(),
      updatedAt: new Date(),
      parkId: configService.get('X_PARK_ID'),
      phoneNumber: configService.get('ADMIN_PHONE'),
    };
    await repository.save(data);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "admin_config"
        `);

    await queryRunner.query(`
            ALTER TABLE "auth"."otp_code" DROP CONSTRAINT "UQ_b3c4c0a7ff9b87072359206521c"
        `);
    await queryRunner.query(`
            ALTER TABLE "auth"."otp_code"
            ADD CONSTRAINT "UQ_3d4a13c3a86d25b6dadea11516c" UNIQUE ("park_id", "phone_number")
        `);
  }
}
