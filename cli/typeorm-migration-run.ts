import { childProcOut } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn } = require('child_process');

const childProc = spawn(
  `npm run typeorm -- migration:run -d ./src/providers/database/typeorm.config.ts`,
  {
    shell: true,
  },
);

childProcOut(childProc);
