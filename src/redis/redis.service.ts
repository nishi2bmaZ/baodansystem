import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  async onModuleInit() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
    this.client.on('error', (e) => console.error('[redis] error', e.message));
    let ok = false;
    for (let i = 1; i <= 10; i++) {
      try {
        await this.client.ping();
        ok = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!ok) throw new Error('[redis] 连接失败：10 秒内无法 ping 通');
    console.log('[redis] 已连接');
  }

  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
