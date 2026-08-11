import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Req,
  UnauthorizedException,
  ParseIntPipe,
} from '@nestjs/common';
import { TaskService } from './task.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTemplateDto } from './dto/create-template.dto';
import { CreateInstanceDto } from './dto/create-instance.dto';
import { SubmitDto } from './dto/submit.dto';
import { ReviewDto } from './dto/review.dto';

@Controller()
export class TaskController {
  constructor(private task: TaskService) {}

  // ===== 后台管理（x-admin-key 校验） =====
  @Post('admin/task-template')
  createTemplate(@Body() dto: CreateTemplateDto, @Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.task.createTemplate(dto);
  }

  @Get('admin/task-templates')
  listTemplates(@Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.task.listTemplates();
  }

  @Post('admin/task-instance')
  createInstance(@Body() dto: CreateInstanceDto, @Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.task.createInstance(dto);
  }

  @Get('admin/task-instances')
  listInstances(@Query('templateId') templateId: string, @Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    const tid = templateId ? parseInt(templateId, 10) : undefined;
    return this.task.listInstances(tid);
  }

  @Post('admin/submission/:id/review')
  review(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewDto,
    @Headers('x-admin-key') key: string,
  ) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.task.review(id, dto.action as 'approve' | 'reject', dto.note);
  }

  @Get('admin/submissions')
  listSubs(
    @Query('instanceId') instanceId: string,
    @Query('status') status: string,
    @Headers('x-admin-key') key: string,
  ) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    const iid = instanceId ? parseInt(instanceId, 10) : undefined;
    return this.task.listSubmissions(iid, status);
  }

  @Get('admin/export/:id')
  exportInst(@Param('id', ParseIntPipe) id: number, @Headers('x-admin-key') key: string) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.task.exportInstance(id);
  }

  @Post('admin/export/selected')
  exportSelected(@Body() body: { ids?: number[] }, @Headers('x-admin-key') key: string, @Req() req: any) {
    if (key !== process.env.ADMIN_KEY) throw new UnauthorizedException('无权操作');
    return this.task.exportSubmissions(body.ids || [], 0, req);
  }

  // ===== 会员（需登录 Token） =====
  @UseGuards(JwtAuthGuard)
  @Get('task/templates')
  memberTemplates() {
    return this.task
      .listTemplates()
      .then((list) => list.filter((t) => t.status === 'PUBLISHED'));
  }

  @UseGuards(JwtAuthGuard)
  @Get('task/instances')
  available() {
    return this.task.availableInstances();
  }

  @UseGuards(JwtAuthGuard)
  @Post('task/instance/:id/grab')
  grab(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.task.grab(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('task/submission/:id/submit')
  submit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitDto,
    @Req() req: any,
  ) {
    return this.task.submit(id, req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('task/my-submissions')
  mine(@Req() req: any) {
    return this.task.mySubmissions(req.user.sub);
  }
}
