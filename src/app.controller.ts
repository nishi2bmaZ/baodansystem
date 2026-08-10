import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  root() {
    return {
      name: '团队任务报单系统',
      version: '0.1.0',
      status: 'running',
    };
  }

  @Get('health')
  async health() {
    const result: any = {
      status: 'ok',
      time: new Date().toISOString(),
      db: 'unknown',
      redis: 'unknown',
    };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      result.db = 'connected';
    } catch (e: any) {
      result.db = 'error: ' + e.message;
    }
    try {
      await this.redis.getClient().ping();
      result.redis = 'connected';
    } catch (e: any) {
      result.redis = 'error: ' + e.message;
    }
    return result;
  }
}
