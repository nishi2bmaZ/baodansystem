import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    // 全局注册 JwtModule：使 Relation 等其它模块的 @UseGuards(JwtAuthGuard)
    // 也能注入到 JwtService，避免启动期依赖解析失败导致容器崩溃重启
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'change-me-in-prod',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
