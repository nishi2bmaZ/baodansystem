import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RelationService {
  constructor(private prisma: PrismaService) {}

  /**
   * 查询某用户的整个团队（下级树）。
   * 用物化路径前缀匹配：path 以该用户 path 开头的，都是其下级。
   */
  async getTeam(userId: number) {
    const root = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!root) throw new NotFoundException('用户不存在');

    const nodes = await this.prisma.user.findMany({
      where: { path: { startsWith: root.path } },
      orderBy: { depth: 'asc' },
      select: {
        id: true,
        email: true,
        phone: true,
        status: true,
        depth: true,
        path: true,
        referrerId: true,
        createdAt: true,
      },
    });

    const tree = this.buildTree(nodes);
    return {
      rootId: userId,
      rootPath: root.path,
      // 团队人数 = 节点总数 - 自己
      totalMembers: nodes.length - 1,
      levels: this.maxDepth(nodes, root.depth),
      tree,
    };
  }

  /** 查询某用户的上级链（从直推到顶层） */
  async getUpline(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    // path 形如 /1/5/ ，split 出 [1,5]，去掉自己得到祖先 id 列表
    const ids = user.path
      .split('/')
      .filter(Boolean)
      .map((x) => parseInt(x, 10));
    const ancestorIds = ids.filter((id) => id !== userId);

    const ancestors = ancestorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ancestorIds } },
          orderBy: { depth: 'asc' },
          select: { id: true, email: true, phone: true, depth: true, status: true },
        })
      : [];

    return { userId, upline: ancestors };
  }

  /**
   * 后台调整某用户的上级。
   * 核心：防环路 + 整棵子树路径/层级联动重算 + 记日志。
   * 依据 Q15：关系调整后，历史业绩按新关系重算（本系统不存快照，所有统计按当前 path 实时计算）。
   */
  async adjustReferrer(dto: { userId: number; newReferrerId?: number; reason?: string }, operatorId = 0) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('用户不存在');

    let newParent = null;
    if (dto.newReferrerId != null) {
      newParent = await this.prisma.user.findUnique({ where: { id: dto.newReferrerId } });
      if (!newParent) throw new NotFoundException('目标上级不存在');
      if (newParent.id === user.id) throw new BadRequestException('不能把上级设为自己');
      // 环路检测：目标上级不能是自己的下级（其 path 不能以 user 的旧 path+id 开头）
      if (newParent.path.startsWith(user.path + user.id + '/')) {
        throw new BadRequestException('目标上级是当前用户的下级，调整会形成环路');
      }
    }

    const oldPath = user.path;
    const oldReferrer = user.referrerId;
    const newPath = newParent ? `${newParent.path}${newParent.id}/` : '/';
    const newDepth = newParent ? newParent.depth + 1 : 0;
    const delta = newDepth - user.depth;

    // 受影响子树（不含自己）：path 以旧 path 开头的所有下级
    const descendants = await this.prisma.user.findMany({
      where: { path: { startsWith: oldPath } },
      select: { id: true, path: true, depth: true },
    });
    const subs = descendants.filter((d) => d.id !== user.id);

    // 事务：更新自己 + 联动更新整棵子树 + 记录日志，保证原子性
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { referrerId: newParent ? newParent.id : null, path: newPath, depth: newDepth },
      });

      for (const d of subs) {
        const np = newPath + d.path.substring(oldPath.length);
        await tx.user.update({
          where: { id: d.id },
          data: { path: np, depth: d.depth + delta },
        });
      }

      await tx.relationAdjustLog.create({
        data: {
          userId: user.id,
          oldReferrer: oldReferrer,
          newReferrer: newParent ? newParent.id : null,
          oldPath,
          newPath,
          operatorId,
          reason: dto.reason ?? null,
        },
      });
    });

    return {
      message: '推荐关系已调整',
      userId: user.id,
      oldReferrer,
      newReferrerId: newParent ? newParent.id : null,
      oldPath,
      newPath,
      movedSubtreeCount: subs.length,
    };
  }

  /** 查询某用户的调整历史（RelationAdjustLog） */
  async getAdjustLog(userId: number) {
    const logs = await this.prisma.relationAdjustLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { userId, logs };
  }

  // ---- 内部工具 ----

  /** 把扁平节点列表组装成嵌套树（依据 referrerId） */
  private buildTree(nodes: any[]): any[] {
    const map = new Map<number, any>();
    nodes.forEach((n) => map.set(n.id, { ...n, children: [] }));
    const roots: any[] = [];
    map.forEach((node) => {
      if (node.referrerId && map.has(node.referrerId)) {
        map.get(node.referrerId).children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  private maxDepth(nodes: any[], rootDepth: number): number {
    let max = 0;
    for (const n of nodes) max = Math.max(max, n.depth - rootDepth);
    return max;
  }
}
