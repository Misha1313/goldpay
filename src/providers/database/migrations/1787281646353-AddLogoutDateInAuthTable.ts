import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLogoutDateInAuthTable1787281646353
  implements MigrationInterface
{
  name = 'AddLogoutDateInAuthTable1787281646353';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "auth"."auth"
            ADD "logout_date" TIMESTAMP
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "auth"."auth" DROP COLUMN "logout_date"
        `);
  }
}
