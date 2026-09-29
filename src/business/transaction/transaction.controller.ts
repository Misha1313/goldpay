import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { TransactionService } from './transaction.service';
import { WithdrawRequest } from './requests/withdraw.request';
import { GetPaymentAccountsRequest } from './requests/get-payment-accounts.request';
import { GetTransactionsRequest } from './requests/get-transactions.request';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('transaction')
@ApiBearerAuth()
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  // @Public()
  @Post('withdraw')
  withdrawBalance(@Body() request: WithdrawRequest, @Req() req) {
    if (req.user.sub === '7bd0be1981ba4314b9b7bb5e02ee5eb9')
      throw new Error('User can not withdrow balance');
    return this.transactionService.withdrawBalance(request, req.user);
  }

  // @Public()
  @Get('payment-accounts')
  getPaymentAccounts(@Req() req) {
    return this.transactionService.getPaymentAccounts(req.user);
  }

  // @Public()
  @Get()
  getTransactions(@Query() request: GetTransactionsRequest, @Req() req) {
    return this.transactionService.getTransactions(request, req.user);
  }

  // @Public()
  // @Post('refill-balance-dev')
  // refillBalance(@Req() req) {
  //   return this.transactionService.refillBalance(req.user);
  // }
}
