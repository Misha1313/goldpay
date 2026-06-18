import { addDays, format } from 'date-fns';
import { TransactionStatusEntity } from 'src/business/transaction/entities/transaction-status.entity';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionTables1779182442871
  implements MigrationInterface
{
  name = 'CreateTransactionTables1779182442871';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "payment_account" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "park_id" character varying NOT NULL,
                "driver_id" character varying,
                "name" character varying NOT NULL,
                "iban" character varying NOT NULL,
                "receiver_first_name" character varying NOT NULL,
                "receiver_last_name" character varying NOT NULL,
                "default" boolean NOT NULL DEFAULT false,
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_d34cebf57efc93f058f8b315409" UNIQUE ("park_id", "driver_id", "iban"),
                CONSTRAINT "PK_bb95477ae48c741a9c1445babfd" PRIMARY KEY ("id")
            )
        `);

    await queryRunner.query(`
            CREATE TABLE "transaction_status" (
                "id" integer NOT NULL,
                "name" character varying NOT NULL,
                CONSTRAINT "PK_05fbbdf6bc1db819f47975c8c0b" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "transaction" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL,
                "park_id" character varying NOT NULL,
                "driver_id" character varying,
                "status_id" integer NOT NULL,
                "iban" character varying NOT NULL,
                "receiver_first_name" character varying NOT NULL,
                "receiver_last_name" character varying NOT NULL,
                "amount" numeric(20, 2),
                "error_code" integer,
                "error_message" character varying,
                "provider_transaction_id" bigint,
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "balance_update_error_code" character varying,
                "balance_update_error_message" character varying,
                CONSTRAINT "PK_89eadb93a89810556e1cbcd6ab9" PRIMARY KEY ("id", "created_at")
            )
            PARTITION BY RANGE (created_at);
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_05fbbdf6bc1db819f47975c8c0" ON "transaction" ("status_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_18158972da15cfd8bac613af67" ON "transaction" ("park_id", "driver_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD CONSTRAINT "FK_05fbbdf6bc1db819f47975c8c0b" FOREIGN KEY ("status_id") REFERENCES "transaction_status"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);

    await this.createTransactionPartitions(queryRunner);
    await this.fillTransactionStatus(queryRunner);
  }

  private async createTransactionPartitions(queryRunner: QueryRunner) {
    // Add partitions
    const currentDate = new Date();
    for (let i = 0; i < 365; i++) {
      const currentDateString = format(addDays(currentDate, i), 'yyyy-MM-dd');
      const nextDateString = format(addDays(currentDate, i + 1), 'yyyy-MM-dd');
      const partitionName = format(addDays(currentDate, i), 'yyyy_MM_dd');

      await queryRunner.query(`
            CREATE TABLE transaction_${partitionName} PARTITION OF transaction
            FOR VALUES FROM ('${currentDateString}') TO ('${nextDateString}');
        `);
    }
  }

  private async fillTransactionStatus(queryRunner: QueryRunner) {
    const repo = queryRunner.manager.getRepository(TransactionStatusEntity);
    const data: Partial<TransactionStatusEntity>[] = [
      {
        id: 0,
        name: 'New',
      },
      {
        id: 1,
        name: 'Ready To Process',
      },
      {
        id: 2,
        name: 'Processing',
      },
      {
        id: 3,
        name: 'Status Check',
      },
      {
        id: 100,
        name: 'Pending',
      },
      {
        id: 1000,
        name: 'Success',
      },
      {
        id: 9999,
        name: 'Cancell',
      },
    ];
    await repo.save(data);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "transaction" DROP CONSTRAINT "FK_05fbbdf6bc1db819f47975c8c0b"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_18158972da15cfd8bac613af67"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_05fbbdf6bc1db819f47975c8c0"
        `);
    await queryRunner.query(`
            DROP TABLE "transaction"
        `);
    await queryRunner.query(`
            DROP TABLE "transaction_status"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c38824a36049ba13ec1bea4ceb"
        `);
    await queryRunner.query(`
            DROP TABLE "payment_account"
        `);
  }
}
