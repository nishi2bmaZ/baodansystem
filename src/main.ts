import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // 静态资源：上传的图片 + 导出的对账 CSV
  mkdirSync(join(process.cwd(), 'uploads'), { recursive: true });
  mkdirSync(join(process.cwd(), 'exports'), { recursive: true });
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  app.useStaticAssets(join(process.cwd(), 'exports'), { prefix: '/exports' });

  const port = parseInt(process.env.APP_PORT || '3000', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`[启动] 团队任务报单系统后端已启动，监听端口 ${port}`);
}
bootstrap();
