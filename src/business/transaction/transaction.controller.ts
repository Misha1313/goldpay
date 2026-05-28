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
    return this.transactionService.withdrawBalance(request, req.user);
  }

  @Public()
  @Get('payment-accounts')
  getPaymentAccounts(@Query() request: GetPaymentAccountsRequest) {
    return this.transactionService.getPaymentAccounts(request);
  }

  @Public()
  @Get()
  getTransactions(@Query() request: GetTransactionsRequest) {
    return this.transactionService.getTransactions(request);
  }
}
