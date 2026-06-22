import { CreateAuthTables1764779169345 } from './migrations/1764779169345-CreateAuthTables';
import { CreateTransactionTables1779182442871 } from './migrations/1779182442871-CreateTransactionTables';
import { AddJobTables1781206827167 } from './migrations/1781206827167-AddJobTables';
import { AddTransactionRegistrationTable1781282358048 } from './migrations/1781282358048-AddTransactionRegistrationTable';
import { AddBalanceRollbackTables1781350122064 } from './migrations/1781350122064-AddBalanceRollbackTables';
import { CreateLogTables1782144203404 } from './migrations/1782144203404-CreateLogTables';

export const migrations = [
  CreateAuthTables1764779169345,
  CreateTransactionTables1779182442871,
  AddJobTables1781206827167,
  AddTransactionRegistrationTable1781282358048,
  AddBalanceRollbackTables1781350122064,
  CreateLogTables1782144203404,
];
