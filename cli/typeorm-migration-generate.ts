import argsParser from 'yargs-parser';

import { childProcOut } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn } = require('child_process');

const args = argsParser(process.argv.slice(2));

const name = args.name || 'Migration';

const childProc = spawn(
  `npm run typeorm -- migration:generate ./src/providers/database/migrations/${name} -d ./src/providers/database/typeorm.config.ts -p -t`,
  {
    shell: true,
  },
);

childProcOut(childProc);
