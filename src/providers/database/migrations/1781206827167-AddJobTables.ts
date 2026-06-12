import { addDays, format } from "date-fns";
import { JobConfigEntity } from "src/business/common/entities/job-config.entity";
import { JobRunningStatusEntity } from "src/business/common/entities/job-running-status.entity";
import { JobConfigEnum } from "src/business/common/enums/job-config.enum";
import { JobRunningStatusEnum } from "src/business/common/enums/job-running-status.enum";
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJobTables1781206827167 implements MigrationInterface {
    name = 'AddJobTables1781206827167'

    public async up(queryRunner: QueryRunner): Promise<void> {
        
        await queryRunner.query(`
            CREATE TABLE "job_config" (
                "key" character varying NOT NULL,
                "active" boolean NOT NULL,
                CONSTRAINT "PK_0112d4835c304c43c811266e390" PRIMARY KEY ("key")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "job_running_status" (
                "id" integer NOT NULL,
                "name" character varying NOT NULL,
                CONSTRAINT "PK_58b2fc16b27f3e677f7b0863830" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "job_running_history" (
                "id" SERIAL NOT NULL,
                "config_key" character varying NOT NULL,
                "status_id" integer NOT NULL,
                "start_date" TIMESTAMP NOT NULL DEFAULT now(),
                "end_date" TIMESTAMP DEFAULT now(),
                "error" character varying,
                CONSTRAINT "PK_390717d4b04a42af4ff35853dbb" PRIMARY KEY ("id", "start_date")
            )
            PARTITION BY RANGE (start_date);
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_30f8d88e9cdf1e4bf80554e7cc" ON "job_running_history" ("config_key")
        `);
        await queryRunner.query(`
            ALTER TABLE "job_running_history"
            ADD CONSTRAINT "FK_30f8d88e9cdf1e4bf80554e7ccb" FOREIGN KEY ("config_key") REFERENCES "job_config"("key") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "job_running_history"
            ADD CONSTRAINT "FK_2f430217c947a58296bf305a69e" FOREIGN KEY ("status_id") REFERENCES "job_running_status"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);

        await this.fillJobConfig(queryRunner);
        await this.fillJobRunningStatus(queryRunner);
        await this.createPartitions(queryRunner);
    }

    private async fillJobConfig(queryRunner: QueryRunner) {
        const jobConfigRepository = queryRunner.manager.getRepository(JobConfigEntity);
        const data: Partial<JobConfigEntity>[] = [
          {
            key: JobConfigEnum.WithdrawalProcessing,
            active: true,
          },
          {
            key: JobConfigEnum.WithdrawalStatusCheck,
            active: true,
          },
          {
            key: JobConfigEnum.BalanceRollBack,
            active: true,
          }
        ];
        await jobConfigRepository.save(data);
    }

    private async fillJobRunningStatus(queryRunner: QueryRunner) {
        const jobRunningStatusRepository = queryRunner.manager.getRepository(JobRunningStatusEntity);
        const data: Partial<JobRunningStatusEntity>[] = [
          {
            id: JobRunningStatusEnum.Running,
            name: 'Running',
          },
          {
            id: JobRunningStatusEnum.Success,
            name: 'Success',
          },
          {
            id: JobRunningStatusEnum.Error,
            name: 'Error',
          },
        ];
        await jobRunningStatusRepository.save(data);
    }

    private async createPartitions(queryRunner: QueryRunner) {
        // Add partitions
        const currentDate = new Date();
        for (let i = 0; i < 365; i++) {
          const currentDateString = format(addDays(currentDate, i), 'yyyy-MM-dd');
          const nextDateString = format(addDays(currentDate, i + 1), 'yyyy-MM-dd');
          const partitionName = format(addDays(currentDate, i), 'yyyy_MM_dd');
    
          await queryRunner.query(`
                CREATE TABLE job_running_history_${partitionName} PARTITION OF job_running_history
                FOR VALUES FROM ('${currentDateString}') TO ('${nextDateString}');
            `);
        }
      }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "job_running_history" DROP CONSTRAINT "FK_2f430217c947a58296bf305a69e"
        `);
        await queryRunner.query(`
            ALTER TABLE "job_running_history" DROP CONSTRAINT "FK_30f8d88e9cdf1e4bf80554e7ccb"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_30f8d88e9cdf1e4bf80554e7cc"
        `);
        await queryRunner.query(`
            DROP TABLE "job_running_history"
        `);
        await queryRunner.query(`
            DROP TABLE "job_running_status"
        `);
        await queryRunner.query(`
            DROP TABLE "job_config"
        `);
       
    }

}
