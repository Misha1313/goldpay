import { MigrationInterface, QueryRunner } from 'typeorm';

export class EditAuthOtpCodeUniqueConstraint1790014285410
  implements MigrationInterface
{
  name = 'EditAuthOtpCodeUniqueConstraint1790014285410';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "auth"."otp_code" DROP CONSTRAINT "UQ_bf1ed33813ba6867fcb58083514"
        `);
    await queryRunner.query(`
            ALTER TABLE "auth"."otp_code"
            ADD CONSTRAINT "UQ_3d4a13c3a86d25b6dadea11516c" UNIQUE ("park_id", "phone_number")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "auth"."otp_code" DROP CONSTRAINT "UQ_3d4a13c3a86d25b6dadea11516c"
        `);
    await queryRunner.query(`
            ALTER TABLE "auth"."otp_code"
            ADD CONSTRAINT "UQ_bf1ed33813ba6867fcb58083514" UNIQUE ("park_id", "driver_id")
        `);
  }
}
