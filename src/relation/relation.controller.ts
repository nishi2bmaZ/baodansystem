import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { RelationService } from './relation.service';
import { AdjustReferrerDto } from './dto/adjust-referrer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class RelationController {
  constructor(private relation: RelationService) {}

  /** 后台：查看某用户的团队树（下级） */
  @Get('admin/relation/tree')
  getTeam(@Query('userId') userId: string, @Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.relation.getTeam(parseInt(userId, 10));
  }

  /** 后台：顶层账号列表（关系树入口，按注册时间升序） */
  @Get('admin/relation/roots')
  getRoots(@Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.relation.getRoots();
  }

  /** 后台：某账号的直推（直接下级）列表，用于逐层下钻 */
  @Get('admin/relation/children')
  getChildren(@Query('userId') userId: string, @Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.relation.getChildren(parseInt(userId, 10));
  }

  /** 后台：单个账号的关系信息（直推数、团队总数、上级链） */
  @Get('admin/relation/node/:userId')
  getNode(@Param('userId') userId: string, @Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.relation.getNode(parseInt(userId, 10));
  }

  /** 后台：按邮箱/手机号搜索账号，返回关系信息用于定位 */
  @Get('admin/relation/search')
  search(@Query('q') q: string, @Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.relation.searchUsers(q);
  }

  /** 后台：查看某用户的上级链 */
  @Get('admin/relation/upline/:userId')
  getUpline(@Param('userId') userId: string, @Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.relation.getUpline(parseInt(userId, 10));
  }

  /** 后台：调整某用户的上级（防环路 + 子树联动 + 记日志） */
  @Post('admin/relation/adjust')
  adjust(@Body() dto: AdjustReferrerDto, @Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.relation.adjustReferrer(dto);
  }

  /** 后台：根据现有 referrerId 重建所有人的 path/depth（数据修复用） */
  @Post('admin/relation/rebuild-paths')
  rebuildPaths(@Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.relation.rebuildPaths();
  }

  /** 后台：查看某用户的推荐关系调整历史 */
  @Get('admin/relation/log/:userId')
  getLog(@Param('userId') userId: string, @Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.relation.getAdjustLog(parseInt(userId, 10));
  }

  /** 会员：查看自己的团队（需登录 Token） */
  @UseGuards(JwtAuthGuard)
  @Get('relation/me/team')
  myTeam(@Req() req: any) {
    return this.relation.getTeam(req.user.sub);
  }

  /** 会员：团队中心（直推人数、团队总人数、直推成员掩码列表，需登录 Token） */
  @UseGuards(JwtAuthGuard)
  @Get('relation/me/center')
  myCenter(@Req() req: any) {
    return this.relation.getTeamCenter(req.user.sub);
  }
}
