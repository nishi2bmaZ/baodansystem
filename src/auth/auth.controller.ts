import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
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

  /** 后台：会员列表（可按状态筛选、按邮箱/手机号搜索） */
  @Get('admin/users')
  listUsers(
    @Query('status') status: string,
    @Query('q') q: string,
    @Headers('x-admin-key') key: string,
  ) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.auth.listUsers(status, q);
  }

  /** 后台：审核会员（action: approve=通过并激活, disable=禁用） */
  @Post('admin/users/:id/review')
  review(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('x-admin-key') key: string,
  ) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    const action = body && body.action === 'disable' ? 'disable' : 'approve';
    return this.auth.review(parseInt(id, 10), action);
  }

  /** 后台：获取单个会员详情（修改弹窗预填） */
  @Get('admin/users/:id')
  getUser(@Param('id') id: string, @Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.auth.getUser(parseInt(id, 10));
  }

  /** 后台：修改会员基本资料（姓名/手机号/等级），权限与禁用按钮相互独立 */
  @Post('admin/users/:id')
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Headers('x-admin-key') key: string,
  ) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.auth.updateProfile(parseInt(id, 10), dto);
  }

  /** 后台：重置会员登录密码 */
  @Post('admin/users/:id/password')
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
    @Headers('x-admin-key') key: string,
  ) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.auth.updatePassword(parseInt(id, 10), dto.password);
  }
}
