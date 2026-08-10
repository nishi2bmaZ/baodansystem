import { Injectable, ExecutionContext, UnauthorizedException, CanActivate } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req: any = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('未登录');
    }
    const token = auth.slice(7);
    try {
      const payload = await this.jwt.verifyAsync(token);
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('登录已过期');
    }
  }
}
