import { addDays, format } from 'date-fns';
import { BalanceRollbackStatusEntity } from 'src/business/transaction/entities/balance-rollback-status.entity';
import { BalanceRollbackStatusEnum } from 'src/business/transaction/enums/balance-rollback-status.enum';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBalanceRollbackTables1781350122064
  implements MigrationInterface
{
  name = 'AddBalanceRollbackTables1781350122064';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "balance_rollback_status" (
                "id" integer NOT NULL,
                "name" character varying NOT NULL,
                CONSTRAINT "PK_3ec21a918894e1a699f524bc4ff" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "balance_rollback" (
                "transaction_id" character varying NOT NULL,
                "transaction_date" TIMESTAMP NOT NULL,
                "status_id" integer NOT NULL,
                "amount" numeric(20, 2),
                "error_code" character varying,
                "error_message" character varying,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "try_count" integer NOT NULL DEFAULT '0',
                CONSTRAINT "PK_f3a9c80c78f4858797d64f819e4" PRIMARY KEY ("transaction_id", "transaction_date")
            )
            PARTITION BY RANGE (transaction_date);
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_3ec21a918894e1a699f524bc4f" ON "balance_rollback" ("status_id")
        `);

    await queryRunner.query(`
            ALTER TABLE "balance_rollback"
            ADD CONSTRAINT "FK_3ec21a918894e1a699f524bc4ff" FOREIGN KEY ("status_id") REFERENCES "balance_rollback_status"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);

    await queryRunner.query(`
            ALTER TABLE "balance_rollback"
            ADD CONSTRAINT "FK_f3a9c80c78f4858797d64f819e4" FOREIGN KEY ("transaction_id", "transaction_date") REFERENCES "transaction"("id", "created_at") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);

    await this.createPartitions(queryRunner);
    await this.fillStatus(queryRunner);
  }

  private async createPartitions(queryRunner: QueryRunner) {
    // Add partitions
    const currentDate = new Date();
    for (let i = 0; i < 365; i++) {
      const currentDateString = format(addDays(currentDate, i), 'yyyy-MM-dd');
      const nextDateString = format(addDays(currentDate, i + 1), 'yyyy-MM-dd');
      const partitionName = format(addDays(currentDate, i), 'yyyy_MM_dd');

      await queryRunner.query(`
              CREATE TABLE balance_rollback_${partitionName} PARTITION OF balance_rollback
              FOR VALUES FROM ('${currentDateString}') TO ('${nextDateString}');
          `);
    }
  }

  private async fillStatus(queryRunner: QueryRunner) {
    const repo = queryRunner.manager.getRepository(BalanceRollbackStatusEntity);
    const data: Partial<BalanceRollbackStatusEntity>[] = [
      {
        id: BalanceRollbackStatusEnum.New,
        name: 'New',
      },
      {
        id: BalanceRollbackStatusEnum.Processing,
        name: 'Processing',
      },
      {
        id: BalanceRollbackStatusEnum.Error,
        name: 'Error',
      },
      {
        id: BalanceRollbackStatusEnum.Success,
        name: 'Success',
      },
    ];
    await repo.save(data);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "balance_rollback" DROP CONSTRAINT "FK_f3a9c80c78f4858797d64f819e4"
        `);
    await queryRunner.query(`
            ALTER TABLE "balance_rollback" DROP CONSTRAINT "FK_3ec21a918894e1a699f524bc4ff"
        `);

    await queryRunner.query(`
            DROP INDEX "public"."IDX_3ec21a918894e1a699f524bc4f"
        `);
    await queryRunner.query(`
            DROP TABLE "balance_rollback"
        `);
    await queryRunner.query(`
            DROP TABLE "balance_rollback_status"
        `);
  }
}
