import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { entities } from './entities';
import { migrations } from './migrations';
import { configService } from 'src/config/cli.config.service';

export default new DataSource({
  type: 'postgres',
  schema: 'public',
  host: configService.get('DB_POSTGRES_HOST'),
  port: configService.get('DB_POSTGRES_PORT'),
  username: configService.get('DB_POSTGRES_USERNAME'),
  password: configService.get('DB_POSTGRES_PASSWORD'),
  database: configService.get('DB_POSTGRES_DATABASE'),
  namingStrategy: new SnakeNamingStrategy(),
  migrationsTableName: 'migrations',
  entities,
  migrations,
});
