import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
  } from '@nestjs/common';
  import { JwtService } from '@nestjs/jwt';
  
  @Injectable()
  export class JwtAuthGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) {}
  
    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest();
  
      const authHeader = request.headers.authorization;
  
      if (
        typeof authHeader !== 'string' ||
        !authHeader.startsWith('Bearer ')
      ) {
        throw new UnauthorizedException(
          'Vui lòng đăng nhập để tiếp tục.',
        );
      }
  
      const token = authHeader.slice(7);
  
      try {
        const payload = await this.jwtService.verifyAsync(token);
  
        if (!Number.isInteger(payload.sub) || payload.sub <= 0) {
          throw new UnauthorizedException('Token không hợp lệ.');
        }
  
        request.user = {
          sub: payload.sub,
          email: payload.email,
          role: payload.role,
        };
  
        return true;
      } catch {
        throw new UnauthorizedException(
          'Token không hợp lệ hoặc đã hết hạn.',
        );
      }
    }
  }