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
}
