import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Param,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller()
export class AuthController {
  constructor(private auth: AuthService) {}

  /** 注册：邮箱+手机号+密码，可填邀请码绑定上级；注册后状态 PENDING */
  @Post('auth/register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  /** 登录：identifier 为邮箱或手机号 */
  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.auth.validateUser(dto.identifier, dto.password).then((u) => this.auth.login(u));
  }

  /** 获取当前登录用户信息（需 Bearer Token） */
  @UseGuards(JwtAuthGuard)
  @Get('auth/me')
  me(@Req() req: any) {
    return req.user;
  }

  /** 客服人工审核通过：MVP 用 x-admin-key 简单保护，后续可换正式后台账号 */
  @Post('admin/users/:id/review')
  review(@Param('id') id: string, @Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.auth.review(parseInt(id, 10));
  }
}
