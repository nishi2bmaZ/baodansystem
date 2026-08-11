import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { join } from 'path';
import { promises as fs } from 'fs';

const FIELD_TYPES = ['text', 'number', 'image', 'dropdown', 'date', 'checkbox'];
const STATUS_CN: Record<string, string> = {
  GRABBED: '已抢单',
  SUBMITTED: '待审核',
  APPROVED: '通过',
  REJECTED: '驳回',
};

@Injectable()
export class TaskService {
  constructor(private prisma: PrismaService) {}

  // ============ 表单模板（后台） ============
  async createTemplate(dto: any, operatorId = 0) {
    if (!Array.isArray(dto.fields) || dto.fields.length === 0)
      throw new BadRequestException('表单至少需要一个字段');
    for (const f of dto.fields) {
      if (!f.key || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.key))
        throw new BadRequestException(`字段 key 非法: ${f.key}`);
      if (!FIELD_TYPES.includes(f.type))
        throw new BadRequestException(`字段类型不支持: ${f.type}`);
      if (f.type === 'dropdown' && (!Array.isArray(f.options) || f.options.length === 0))
        throw new BadRequestException(`下拉字段 ${f.key} 必须提供 options`);
    }
    const tpl = await this.prisma.taskTemplate.create({
      data: {
        name: dto.name,
        schemaJson: JSON.stringify(dto.fields),
        status: dto.status || 'DRAFT',
        createdById: operatorId,
      },
    });
    return this.serializeTemplate(tpl);
  }

  async listTemplates() {
    const list = await this.prisma.taskTemplate.findMany({ orderBy: { id: 'desc' } });
    return list.map((t) => this.serializeTemplate(t));
  }

  // ============ 任务发布（后台） ============
  async createInstance(dto: any) {
    const tpl = await this.prisma.taskTemplate.findUnique({ where: { id: dto.templateId } });
    if (!tpl) throw new NotFoundException('模板不存在');
    if (!dto.quota || dto.quota <= 0) throw new BadRequestException('名额必须大于 0');
    const inst = await this.prisma.taskInstance.create({
      data: {
        templateId: dto.templateId,
        title: dto.title,
        date: new Date(dto.date),
        quota: dto.quota,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        status: 'OPEN',
      },
    });
    return this.serializeInstance(inst, tpl);
  }

  async listInstances(templateId?: number) {
    const where = templateId ? { templateId } : {};
    const list = await this.prisma.taskInstance.findMany({
      where,
      orderBy: { id: 'desc' },
      include: { template: true },
    });
    return list.map((i) => this.serializeInstance(i, i.template));
  }

  // ============ 会员：可抢任务 ============
  async availableInstances() {
    const list = await this.prisma.taskInstance.findMany({
      where: { status: 'OPEN' },
      include: { template: true },
      orderBy: { id: 'desc' },
    });
    // 过滤名额已满的（Prisma 不支持字段间比较，用 JS 过滤）
    return list
      .filter((i) => i.grabbed < i.quota)
      .map((i) => this.serializeInstance(i, i.template));
  }

  // ============ 会员：抢槽位 ============
  async grab(instanceId: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const inst = await tx.taskInstance.findUnique({ where: { id: instanceId } });
      if (!inst) throw new NotFoundException('任务不存在');
      if (inst.status !== 'OPEN') throw new BadRequestException('任务已关闭');
      if (inst.grabbed >= inst.quota) throw new BadRequestException('名额已满');
      const sub = await tx.submission.create({
        data: {
          instance: { connect: { id: instanceId } },
          user: { connect: { id: userId } },
          status: 'GRABBED',
          data: '',
        },
      });
      await tx.taskInstance.update({
        where: { id: instanceId },
        data: { grabbed: { increment: 1 } },
      });
      return {
        message: '抢单成功',
        submissionId: sub.id,
        instanceId,
        grabbed: inst.grabbed + 1,
        quota: inst.quota,
      };
    });
  }

  // ============ 会员：提交表单 ============
  async submit(submissionId: number, userId: number, dto: any) {
    const sub = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!sub) throw new NotFoundException('提交记录不存在');
    if (sub.userId !== userId) throw new ForbiddenException('只能提交自己的任务');
    if (!['GRABBED', 'REJECTED'].includes(sub.status))
      throw new BadRequestException('当前状态不可提交');

    const inst = await this.prisma.taskInstance.findUnique({ where: { id: sub.instanceId } });
    const tpl = await this.prisma.taskTemplate.findUnique({ where: { id: inst.templateId } });
    const fields = JSON.parse(tpl.schemaJson);
    const { data, images } = this.validateData(fields, dto.data || {}, dto.images);

    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        data: JSON.stringify(data),
        images: images.length ? JSON.stringify(images) : null,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        submitDeadline: inst.endTime,
      },
    });
    return { message: '提交成功', submissionId, status: 'SUBMITTED' };
  }

  // ============ 会员：我的提交 ============
  async mySubmissions(userId: number) {
    const list = await this.prisma.submission.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      include: { instance: { include: { template: true } } },
    });
    return list.map((s) => this.serializeSubmission(s));
  }

  // ============ 后台：审核 ============
  async review(submissionId: number, action: 'approve' | 'reject', note: string, operatorId = 0) {
    const sub = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!sub) throw new NotFoundException('提交记录不存在');
    if (sub.status !== 'SUBMITTED') throw new BadRequestException('仅待审核记录可审核');
    const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status,
        reviewedById: operatorId,
        reviewedAt: new Date(),
        rejectReason: action === 'reject' ? note || '不符合要求' : null,
      },
    });
    return { message: action === 'approve' ? '已通过' : '已驳回', submissionId, status };
  }

  // ============ 后台：提交列表 ============
  async listSubmissions(instanceId?: number, status?: string) {
    const where: any = {};
    if (instanceId) where.instanceId = instanceId;
    if (status) where.status = status;
    const list = await this.prisma.submission.findMany({
      where,
      orderBy: { id: 'desc' },
      include: { user: true, instance: { include: { template: true } } },
    });
    return list.map((s) => this.serializeSubmission(s));
  }

  // ============ 后台：导出对账 CSV ============
  async exportInstance(instanceId: number, operatorId = 0) {
    const inst = await this.prisma.taskInstance.findUnique({
      where: { id: instanceId },
      include: {
        template: true,
        submissions: { include: { user: true }, orderBy: { id: 'asc' } },
      },
    });
    if (!inst) throw new NotFoundException('任务不存在');
    const fields: any[] = JSON.parse(inst.template.schemaJson);
    const header = [
      '提交ID',
      '会员邮箱',
      '手机号',
      '提交时间',
      '状态',
      ...fields.map((f) => f.label),
      '图片',
    ];
    const rows = inst.submissions.map((s: any) => {
      const d = s.data ? JSON.parse(s.data) : {};
      const imgs = s.images ? JSON.parse(s.images) : [];
      return [
        s.id,
        s.user.email,
        s.user.phone,
        s.submittedAt ? new Date(s.submittedAt).toISOString() : '',
        STATUS_CN[s.status] || s.status,
        ...fields.map((f: any) => (d[f.key] ?? '')),
        imgs.join(' '),
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((c) => this.csvCell(c)).join(','))
      .join('\n');

    const dir = join(process.cwd(), 'exports');
    await fs.mkdir(dir, { recursive: true });
    const fname = `instance_${instanceId}_${Date.now()}.csv`;
    await fs.writeFile(join(dir, fname), '﻿' + csv, 'utf8'); // BOM 兼容 Excel

    await this.prisma.exportRecord.create({
      data: {
        instanceId,
        date: inst.date,
        filePath: `/exports/${fname}`,
        rowCount: rows.length,
        createdById: operatorId,
      } as any,
    });
    return { url: `/exports/${fname}`, rowCount: rows.length };
  }

  // ============ 内部：字段校验 ============
  private validateData(fields: any[], raw: any, extraImages?: string[]) {
    const data: Record<string, any> = {};
    const images: string[] = [];
    for (const f of fields) {
      const v = raw[f.key];
      const empty = v === undefined || v === null || v === '';
      if (f.required && empty) throw new BadRequestException(`「${f.label}」为必填项`);
      if (empty) {
        data[f.key] = null;
        continue;
      }
      switch (f.type) {
        case 'text':
          if (typeof v !== 'string') throw new BadRequestException(`「${f.label}」应为文本`);
          data[f.key] = v;
          break;
        case 'number': {
          const n = typeof v === 'number' ? v : Number(v);
          if (Number.isNaN(n)) throw new BadRequestException(`「${f.label}」应为数字`);
          data[f.key] = n;
          break;
        }
        case 'date':
          if (typeof v !== 'string') throw new BadRequestException(`「${f.label}」应为日期`);
          data[f.key] = v;
          break;
        case 'checkbox':
          if (typeof v !== 'boolean')
            throw new BadRequestException(`「${f.label}」应为勾选(true/false)`);
          data[f.key] = v;
          break;
        case 'dropdown':
          if (!Array.isArray(f.options) || !f.options.includes(v))
            throw new BadRequestException(`「${f.label}」取值不在可选范围内`);
          data[f.key] = v;
          break;
        case 'image':
          if (typeof v !== 'string') throw new BadRequestException(`「${f.label}」应为图片地址`);
          data[f.key] = v;
          images.push(v);
          break;
      }
    }
    if (Array.isArray(extraImages)) images.push(...extraImages.filter(Boolean));
    return { data, images };
  }

  // ============ 序列化 ============
  private serializeTemplate(t: any) {
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      fields: JSON.parse(t.schemaJson),
      createdAt: t.createdAt,
    };
  }

  private serializeInstance(i: any, tpl: any) {
    return {
      id: i.id,
      title: i.title,
      date: i.date,
      quota: i.quota,
      grabbed: i.grabbed,
      startTime: i.startTime,
      endTime: i.endTime,
      status: i.status,
      template: tpl
        ? { id: tpl.id, name: tpl.name, fields: JSON.parse(tpl.schemaJson) }
        : null,
    };
  }

  private serializeSubmission(s: any) {
    return {
      id: s.id,
      instanceId: s.instanceId,
      status: s.status,
      data: s.data ? JSON.parse(s.data) : {},
      images: s.images ? JSON.parse(s.images) : [],
      submittedAt: s.submittedAt,
      reviewedAt: s.reviewedAt,
      rejectReason: s.rejectReason,
      user: s.user ? { id: s.user.id, email: s.user.email, phone: s.user.phone } : undefined,
      instance: s.instance ? { id: s.instance.id, title: s.instance.title } : undefined,
    };
  }

  private csvCell(v: any): string {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
}
