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
  COMPLETED: '已完成',
  REJECTED: '驳回',
};

@Injectable()
export class TaskService {
  constructor(private prisma: PrismaService) {}

  // 安全解析 stagesJson
  private safeStages(json: string): any[] {
    try {
      const a = JSON.parse(json);
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }
  private safeStagesData(json: string): Record<string, any> {
    try {
      const o = JSON.parse(json);
      return o && typeof o === 'object' ? o : {};
    } catch (e) {
      return {};
    }
  }

  // ============ 表单模板（后台） ============
  async createTemplate(dto: any, operatorId = 0) {
    if (!Array.isArray(dto.stages) || dto.stages.length === 0)
      throw new BadRequestException('模板至少需要一个阶段');
    const stages = dto.stages.map((st: any, si: number) => {
      if (!st || !st.title || !st.title.trim())
        throw new BadRequestException(`第 ${si + 1} 个阶段标题必填`);
      if (!Array.isArray(st.fields) || st.fields.length === 0)
        throw new BadRequestException(`第 ${si + 1} 个阶段至少需要一个字段`);
      const fields = st.fields.map((f: any) => {
        if (!f.key || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.key))
          throw new BadRequestException(`字段 key 非法: ${f.key}`);
        if (!FIELD_TYPES.includes(f.type))
          throw new BadRequestException(`字段类型不支持: ${f.type}`);
        if (f.type === 'dropdown' && (!Array.isArray(f.options) || f.options.length === 0))
          throw new BadRequestException(`下拉字段 ${f.key} 必须提供 options`);
        return {
          key: f.key,
          label: f.label,
          type: f.type,
          required: !!f.required,
          options: f.type === 'dropdown' ? f.options : [],
          placeholder: f.placeholder || '',
        };
      });
      const steps = Array.isArray(st.steps)
        ? st.steps
            .filter((s: any) => s && s.label && String(s.label).trim())
            .map((s: any) => ({
              label: String(s.label),
              content: String(s.content || ''),
              copyable: !!s.copyable,
              image: s.image ? String(s.image) : null,
            }))
        : [];
      return { title: st.title.trim(), fields, steps };
    });

    const tpl = await this.prisma.taskTemplate.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        stagesJson: JSON.stringify(stages),
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

      // 同模板锁定：该用户在本模板下存在任意未完成提交，则不能再抢同模板的其他任务
      const conflict = await tx.submission.findFirst({
        where: {
          userId,
          status: { in: ['GRABBED', 'SUBMITTED', 'REJECTED'] },
          instance: { templateId: inst.templateId },
        },
      });
      if (conflict)
        throw new BadRequestException('同模板任务尚未完成，暂不可抢购其他任务');

      const sub = await tx.submission.create({
        data: {
          instance: { connect: { id: instanceId } },
          user: { connect: { id: userId } },
          status: 'GRABBED',
          stageIndex: 0,
          stagesData: '{}',
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
        stageIndex: 0,
      };
    });
  }

  // ============ 会员：提交当前阶段 ============
  async submit(submissionId: number, userId: number, dto: any) {
    const sub = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!sub) throw new NotFoundException('提交记录不存在');
    if (sub.userId !== userId) throw new ForbiddenException('只能提交自己的任务');
    if (!['GRABBED', 'REJECTED'].includes(sub.status))
      throw new BadRequestException('当前状态不可提交');

    const inst = await this.prisma.taskInstance.findUnique({ where: { id: sub.instanceId } });
    const tpl = await this.prisma.taskTemplate.findUnique({ where: { id: inst.templateId } });
    const stages = this.safeStages(tpl.stagesJson);
    const stage = stages[sub.stageIndex];
    if (!stage) throw new BadRequestException('阶段不存在');

    const { data, images } = this.validateData(stage.fields, dto.data || {}, dto.images);

    const all = this.safeStagesData(sub.stagesData || '{}');
    all[sub.stageIndex] = { data, images };

    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        stagesData: JSON.stringify(all),
        data: JSON.stringify(data),
        images: images.length ? JSON.stringify(images) : null,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        submitDeadline: inst.endTime,
      },
    });
    return { message: '提交成功', submissionId, status: 'SUBMITTED', stageIndex: sub.stageIndex };
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

  // ============ 后台：审核（多阶段推进） ============
  async review(submissionId: number, action: 'approve' | 'reject', note: string, operatorId = 0) {
    const sub = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!sub) throw new NotFoundException('提交记录不存在');
    if (sub.status !== 'SUBMITTED') throw new BadRequestException('仅待审核记录可审核');

    const inst = await this.prisma.taskInstance.findUnique({ where: { id: sub.instanceId } });
    const tpl = await this.prisma.taskTemplate.findUnique({ where: { id: inst.templateId } });
    const stageCount = this.safeStages(tpl.stagesJson).length;

    let update: any;
    if (action === 'approve') {
      if (sub.stageIndex >= stageCount - 1) {
        // 末阶段审核通过 → 任务完成
        update = { status: 'COMPLETED', reviewedById: operatorId, reviewedAt: new Date(), rejectReason: null };
      } else {
        // 通过当前阶段 → 进入下一阶段填写
        update = {
          status: 'GRABBED',
          stageIndex: sub.stageIndex + 1,
          reviewedById: operatorId,
          reviewedAt: new Date(),
          rejectReason: null,
        };
      }
    } else {
      // 驳回 → 停留在当前阶段，会员可重填
      update = {
        status: 'REJECTED',
        reviewedById: operatorId,
        reviewedAt: new Date(),
        rejectReason: note || '不符合要求',
      };
    }
    await this.prisma.submission.update({ where: { id: submissionId }, data: update });
    return { message: action === 'approve' ? '已通过' : '已驳回', submissionId, status: update.status, stageIndex: update.stageIndex ?? sub.stageIndex };
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

  // ============ 后台：导出对账 CSV（按任务实例） ============
  async exportInstance(instanceId: number, operatorId = 0) {
    const inst = await this.prisma.taskInstance.findUnique({
      where: { id: instanceId },
      include: {
        template: true,
        submissions: { include: { user: true }, orderBy: { id: 'asc' } },
      },
    });
    if (!inst) throw new NotFoundException('任务不存在');
    const stages = this.safeStages(inst.template.stagesJson);
    const fieldMap = new Map<string, { label: string; type: string }>();
    stages.forEach((st: any) =>
      (st.fields || []).forEach((f: any) => {
        if (!fieldMap.has(f.key)) fieldMap.set(f.key, { label: f.label, type: f.type });
      }),
    );
    const fieldList = [...fieldMap.entries()].map(([k, v]) => [k, v.label, v.type] as [string, string, string]);

    const base = process.env.PUBLIC_BASE || '';
    const header = [
      '提交ID', '会员邮箱', '手机号', '提交时间', '审核时间', '状态',
      ...fieldList.map(([, l]) => l),
      '图片',
    ];
    const rows = inst.submissions.map((s: any) => {
      const all = this.safeStagesData(s.stagesData || '{}');
      const merged: any = {};
      const imgs: string[] = [];
      Object.values(all).forEach((st: any) => {
        Object.assign(merged, st.data || {});
        (st.images || []).forEach((u: string) => imgs.push(this.absUrl(base, u)));
      });
      return [
        s.id,
        s.user.email,
        s.user.phone,
        s.submittedAt ? new Date(s.submittedAt).toLocaleString('zh-CN') : '',
        s.reviewedAt ? new Date(s.reviewedAt).toLocaleString('zh-CN') : '',
        STATUS_CN[s.status] || s.status,
        ...fieldList.map(([k, , type]) => (type === 'image' ? this.absUrl(base, merged[k]) : (merged[k] ?? ''))),
        imgs.join(' '),
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((c) => this.csvCell(c)).join(','))
      .join('\n');

    const dir = join(process.cwd(), 'exports');
    await fs.mkdir(dir, { recursive: true });
    const fname = `instance_${instanceId}_${Date.now()}.csv`;
    await fs.writeFile(join(dir, fname), '﻿' + csv, 'utf8');

    await this.prisma.exportRecord.create({
      data: { instanceId, date: inst.date, filePath: `/exports/${fname}`, rowCount: rows.length, createdById: operatorId } as any,
    });
    return { url: `/exports/${fname}`, rowCount: rows.length };
  }

  // ============ 后台：按提交ID批量导出 ============
  async exportSubmissions(ids: number[], operatorId = 0, req?: any) {
    if (!ids || !ids.length) throw new BadRequestException('请选择要导出的记录');
    const subs = await this.prisma.submission.findMany({
      where: { id: { in: ids } },
      include: { user: true, instance: { include: { template: true } } },
      orderBy: { id: 'asc' },
    });
    if (!subs.length) throw new NotFoundException('未找到对应的提交记录');

    const fieldMap = new Map<string, { label: string; type: string }>();
    subs.forEach((s: any) => {
      const tpl = s.instance && s.instance.template;
      if (!tpl) return;
      this.safeStages(tpl.stagesJson).forEach((st: any) =>
        (st.fields || []).forEach((f: any) => {
          if (!fieldMap.has(f.key)) fieldMap.set(f.key, { label: f.label, type: f.type });
        }),
      );
    });
    const fieldList = [...fieldMap.entries()].map(([k, v]) => [k, v.label, v.type] as [string, string, string]);
    const base = process.env.PUBLIC_BASE || (req && req.get ? `${req.protocol}://${req.get('host')}` : '');

    const header = [
      '提交ID', '任务标题', '模板名称', '会员邮箱', '手机号', '状态',
      '提交时间', '审核时间', '驳回理由',
      ...fieldList.map(([, l]) => l),
      '图片',
    ];
    const rows = subs.map((s: any) => {
      const all = this.safeStagesData(s.stagesData || '{}');
      const merged: any = {};
      const imgs: string[] = [];
      Object.values(all).forEach((st: any) => {
        Object.assign(merged, st.data || {});
        (st.images || []).forEach((u: string) => imgs.push(this.absUrl(base, u)));
      });
      const tpl = s.instance && s.instance.template;
      return [
        s.id,
        s.instance ? s.instance.title : '',
        tpl ? tpl.name : '',
        s.user ? s.user.email : '',
        s.user ? s.user.phone : '',
        STATUS_CN[s.status] || s.status,
        s.submittedAt ? new Date(s.submittedAt).toLocaleString('zh-CN') : '',
        s.reviewedAt ? new Date(s.reviewedAt).toLocaleString('zh-CN') : '',
        s.rejectReason || '',
        ...fieldList.map(([k, , type]) => (type === 'image' ? this.absUrl(base, merged[k]) : (merged[k] ?? ''))),
        imgs.join(' '),
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((c) => this.csvCell(c)).join(','))
      .join('\n');

    const dir = join(process.cwd(), 'exports');
    await fs.mkdir(dir, { recursive: true });
    const fname = `submissions_${Date.now()}.csv`;
    await fs.writeFile(join(dir, fname), '﻿' + csv, 'utf8');

    await this.prisma.exportRecord.create({
      data: { instanceId: subs[0].instanceId, date: subs[0].instance ? subs[0].instance.date : null, filePath: `/exports/${fname}`, rowCount: rows.length, createdById: operatorId } as any,
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
    const stages = this.safeStages(t.stagesJson);
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      description: t.description,
      stages,
      stageCount: stages.length,
      createdAt: t.createdAt,
    };
  }

  private serializeInstance(i: any, tpl: any) {
    const stages = tpl ? this.safeStages(tpl.stagesJson) : [];
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
        ? {
            id: tpl.id,
            name: tpl.name,
            description: tpl.description,
            stages,
            stageCount: stages.length,
          }
        : null,
    };
  }

  private serializeSubmission(s: any) {
    const tpl = s.instance && s.instance.template;
    const stages = tpl ? this.safeStages(tpl.stagesJson) : [];
    return {
      id: s.id,
      instanceId: s.instanceId,
      status: s.status,
      stageIndex: s.stageIndex,
      stagesData: this.safeStagesData(s.stagesData || '{}'),
      data: s.data ? JSON.parse(s.data) : {},
      images: s.images ? JSON.parse(s.images) : [],
      submittedAt: s.submittedAt,
      reviewedAt: s.reviewedAt,
      rejectReason: s.rejectReason,
      stageCount: stages.length,
      currentStage: stages[s.stageIndex] || null,
      user: s.user ? { id: s.user.id, email: s.user.email, phone: s.user.phone } : undefined,
      instance: s.instance
        ? {
            id: s.instance.id,
            title: s.instance.title,
            template: tpl
              ? { id: tpl.id, name: tpl.name, description: tpl.description, stages, stageCount: stages.length }
              : null,
          }
        : undefined,
    };
  }

  private csvCell(v: any): string {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  // 将存储的图片路径/网址统一为可打开的绝对网址
  private absUrl(base: string, u: any): string {
    if (!u || typeof u !== 'string') return '';
    if (/^https?:\/\//i.test(u)) return u; // 已是绝对网址，原样保留
    const p = u.startsWith('/') ? u : `/uploads/${u}`; // 兼容「/uploads/x」与「x」两种存储形式
    return base ? base + p : p;
  }
}
