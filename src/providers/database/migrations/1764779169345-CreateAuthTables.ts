import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthTables1764779169345 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        CREATE SCHEMA IF NOT EXISTS auth;  
    `);

    await queryRunner.query(`
            CREATE TABLE "auth"."otp_code" (
                "id" SERIAL NOT NULL,
                "updated_at" TIMESTAMP NOT NULL,
                "park_id" character varying NOT NULL,
                "driver_id" character varying,
                "phone_number" character varying NOT NULL,
                "role_id" integer NOT NULL,
                "code" character varying NOT NULL,
                CONSTRAINT "UQ_bf1ed33813ba6867fcb58083514" UNIQUE ("park_id", "driver_id"),
                CONSTRAINT "PK_c2c773c7da0f03da4a23c4066a7" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "auth"."auth" (
                "id" SERIAL NOT NULL,
                "created_at" TIMESTAMP NOT NULL,
                "updated_at" TIMESTAMP NOT NULL,
                "park_id" character varying NOT NULL,
                "driver_id" character varying,
                "phone_number" character varying NOT NULL,
                "role_id" integer NOT NULL,
                CONSTRAINT "PK_7e416cf6172bc5aec04244f6459" PRIMARY KEY ("id")
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
