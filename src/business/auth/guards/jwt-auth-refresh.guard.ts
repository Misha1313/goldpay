import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthRefreshGuard extends AuthGuard('jwt-refresh') {
  canActivate(context: ExecutionContext) {
    console.log('guard');
    const request = context.switchToHttp().getRequest();

    console.log('Cookies:', request.cookies);
    console.log('Refresh token:', request.cookies?.refreshToken);
    return super.canActivate(context);
  }
}
