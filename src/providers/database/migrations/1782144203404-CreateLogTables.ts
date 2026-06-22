import { addDays, format } from 'date-fns';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLogTables1782144203404 implements MigrationInterface {
  name = 'CreateLogTables1782144203404';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "yandex_log" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL,
                "transaction_id" integer,
                "driver_id" character varying,
                "process" character varying,
                "method" character varying NOT NULL,
                "http_status" integer,
                "request" jsonb,
                "response" jsonb,
                "error" character varying,
                "updated_at" TIMESTAMP DEFAULT now(),
                "park_id" character varying NOT NULL,
                CONSTRAINT "PK_7a40653009bc95e00badddc0648" PRIMARY KEY ("id", "created_at")
            )
            PARTITION BY RANGE (created_at);
        `);
    await queryRunner.query(`
            CREATE TABLE "payment_log" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL,
                "transaction_id" integer,
                "method" character varying NOT NULL,
                "http_status" integer,
                "request" jsonb,
                "response" jsonb,
                "error" character varying,
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "PK_e3df2a0ee450e0478bb961f25e4" PRIMARY KEY ("id", "created_at")
            )
            PARTITION BY RANGE (created_at);
        `);

    await this.createPartitions(queryRunner, 'yandex_log');
    await this.createPartitions(queryRunner, 'payment_log');
  }

  private async createPartitions(queryRunner: QueryRunner, tableName: string) {
    // Add partitions
    const currentDate = new Date();
    for (let i = 0; i < 365; i++) {
      const currentDateString = format(addDays(currentDate, i), 'yyyy-MM-dd');
      const nextDateString = format(addDays(currentDate, i + 1), 'yyyy-MM-dd');
      const partitionName = format(addDays(currentDate, i), 'yyyy_MM_dd');

      await queryRunner.query(`
                CREATE TABLE ${tableName}_${partitionName} PARTITION OF ${tableName}
                FOR VALUES FROM ('${currentDateString}') TO ('${nextDateString}');
            `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "payment_log"
        `);
    await queryRunner.query(`
            DROP TABLE "yandex_log"
        `);
  }
}
