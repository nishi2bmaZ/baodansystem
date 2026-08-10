import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = parseInt(process.env.APP_PORT || '3000', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`[启动] 团队任务报单系统后端已启动，监听端口 ${port}`);
}
bootstrap();
