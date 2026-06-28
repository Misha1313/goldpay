import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionRegistrationTable1781282358048
  implements MigrationInterface
{
  name = 'AddTransactionRegistrationTable1781282358048';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "transaction_registration" (
                "park_id" character varying NOT NULL,
                "driver_id" character varying NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_97bafc16ae99b35aa0d7b13f22a" PRIMARY KEY ("park_id", "driver_id")
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "transaction_registration"
        `);
  }
}
