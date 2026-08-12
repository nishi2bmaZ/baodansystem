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

    // 受影响子树（不含自己）：path 必须以「旧 path + 自己 id + /」开头，
    // 避免 oldPath 前缀刚好与别人相同时把兄弟/上级误判为子树。
    const descendants = await this.prisma.user.findMany({
      where: { path: { startsWith: oldPath + user.id + '/' } },
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

  /**
   * 顶层账号（无上级），按注册时间升序。
   * 用于关系树「从最顶层第一个账号开始展示」。
   * 每个节点附带直推数量(directCount)与团队总人数(teamTotal, 含自己)。
   */
  async getRoots() {
    const roots = await this.prisma.user.findMany({
      where: { referrerId: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, phone: true, status: true, depth: true, createdAt: true },
    });
    const all = await this.prisma.user.findMany({ select: { id: true, referrerId: true } });
    const stats = this.computeStats(all);
    return {
      roots: roots.map((r) => ({
        id: r.id, email: r.email, phone: r.phone, status: r.status, depth: r.depth,
        directCount: stats.get(r.id).directCount,
        teamTotal: stats.get(r.id).teamTotal,
        hasChildren: stats.get(r.id).directCount > 0,
      })),
    };
  }

  /**
   * 查询某账号的直推（直接下级）列表，支持逐层下钻。
   * 每个下级附带直推数量与团队总人数，以及 hasChildren（是否有下一级）。
   */
  async getChildren(userId: number) {
    const parent = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, path: true } });
    if (!parent) throw new NotFoundException('用户不存在');
    const sub = await this.prisma.user.findMany({
      where: { path: { startsWith: parent.path } },
      select: { id: true, email: true, phone: true, status: true, depth: true, referrerId: true, createdAt: true },
    });
    const stats = this.computeStats(sub);
    const children = sub
      .filter((s) => s.referrerId === userId)
      .map((c) => ({
        id: c.id, email: c.email, phone: c.phone, status: c.status, depth: c.depth,
        directCount: stats.get(c.id).directCount,
        teamTotal: stats.get(c.id).teamTotal,
        hasChildren: stats.get(c.id).directCount > 0,
      }));
    return { parentId: userId, children };
  }

  /** 单个账号的关系信息：直推数、团队总数、上级链（从顶层到直推）。 */
  async getNode(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, status: true, depth: true, referrerId: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('用户不存在');
    const all = await this.prisma.user.findMany({ select: { id: true, referrerId: true } });
    const stats = this.computeStats(all);
    const upline = await this.getUpline(userId);
    return {
      node: {
        id: user.id, email: user.email, phone: user.phone, status: user.status,
        depth: user.depth, referrerId: user.referrerId,
        directCount: stats.get(user.id).directCount,
        teamTotal: stats.get(user.id).teamTotal,
      },
      upline: upline.upline,
    };
  }

  /**
   * 会员端「团队中心」数据：
   * - 直推人数（directCount）
   * - 团队总人数（teamTotal，含自己）
   * - 直推成员列表（仅直接下级）：掩码手机号 + 注册时间
   * 手机号在服务端做掩码，避免把完整号码下发到前端。
   */
  async getTeamCenter(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, path: true, referrerId: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    const all = await this.prisma.user.findMany({ select: { id: true, referrerId: true } });
    const stats = this.computeStats(all);

    const directs = await this.prisma.user.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'asc' },
      select: { phone: true, createdAt: true },
    });

    return {
      directCount: stats.get(userId).directCount,
      teamTotal: stats.get(userId).teamTotal,
      directMembers: directs.map((d) => ({
        phone: this.maskPhone(d.phone),
        createdAt: d.createdAt,
      })),
    };
  }

  /** 按邮箱/手机号搜索账号，返回关系信息，便于前端定位到对应节点。 */
  async searchUsers(q: string) {
    const kw = (q || '').trim();
    if (!kw) return { results: [] };
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: kw, mode: 'insensitive' } },
          { phone: { contains: kw } },
        ],
      },
      select: { id: true, email: true, phone: true, status: true, depth: true, referrerId: true },
      take: 50,
    });
    const all = await this.prisma.user.findMany({ select: { id: true, referrerId: true } });
    const stats = this.computeStats(all);
    const results = [];
    for (const u of users) {
      const up = await this.getUpline(u.id);
      results.push({
        id: u.id, email: u.email, phone: u.phone, status: u.status, depth: u.depth,
        referrerId: u.referrerId,
        directCount: stats.get(u.id).directCount,
        teamTotal: stats.get(u.id).teamTotal,
        upline: up.upline,
      });
    }
    return { results };
  }

  /**
   * 根据现有 referrerId 关系，重新计算并写回所有人的 path/depth。
   * 用于修复因历史 bug 或人工调整导致 path/depth 与 referrerId 不一致的脏数据。
   */
  async rebuildPaths() {
    const users = await this.prisma.user.findMany({
      select: { id: true, referrerId: true, email: true },
    });
    const userMap = new Map<number, any>();
    users.forEach((u) => userMap.set(u.id, u));

    // 按 referrerId 建立子节点映射
    const childrenMap = new Map<number, number[]>();
    for (const u of users) {
      if (u.referrerId != null) {
        if (!childrenMap.has(u.referrerId)) childrenMap.set(u.referrerId, []);
        childrenMap.get(u.referrerId).push(u.id);
      }
    }

    const updates: { id: number; path: string; depth: number }[] = [];
    const queue: { id: number; path: string; depth: number }[] = [];

    // 从所有顶层（无上级）开始 BFS
    for (const u of users) {
      if (u.referrerId == null) {
        queue.push({ id: u.id, path: '/', depth: 0 });
      }
    }

    while (queue.length) {
      const cur = queue.shift()!;
      updates.push(cur);
      const children = childrenMap.get(cur.id) || [];
      for (const childId of children) {
        queue.push({ id: childId, path: `${cur.path}${cur.id}/`, depth: cur.depth + 1 });
      }
    }

    // 事务批量更新
    await this.prisma.$transaction(async (tx) => {
      for (const up of updates) {
        await tx.user.update({ where: { id: up.id }, data: { path: up.path, depth: up.depth } });
      }
    });

    return { updated: updates.length, details: updates.map((u) => ({ id: u.id, email: userMap.get(u.id).email, path: u.path, depth: u.depth })) };
  }

  // ---- 内部工具 ----

  /**
   * 基于 referrerId 计算任意节点集合的直推数量与团队总人数。
   * 团队总数 = 该节点整棵子树（含自己）的人数。
   * 用子节点映射 + 记忆化 DFS 计算，复杂度 O(n)。
   */
  private computeStats(nodes: any[]): Map<number, { directCount: number; teamTotal: number }> {
    const childrenMap = new Map<number, number[]>();
    for (const n of nodes) {
      if (n.referrerId != null) {
        if (!childrenMap.has(n.referrerId)) childrenMap.set(n.referrerId, []);
        childrenMap.get(n.referrerId).push(n.id);
      }
    }
    const memo = new Map<number, number>();
    const sizeOf = (id: number): number => {
      if (memo.has(id)) return memo.get(id);
      let s = 1;
      for (const c of childrenMap.get(id) || []) s += sizeOf(c);
      memo.set(id, s);
      return s;
    };
    const stats = new Map<number, { directCount: number; teamTotal: number }>();
    for (const n of nodes) {
      stats.set(n.id, {
        directCount: (childrenMap.get(n.id) || []).length,
        teamTotal: sizeOf(n.id),
      });
    }
    return stats;
  }

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

  /** 手机号掩码：保留前 3 后 4，中间用 **** 替代（如 138****5678） */
  private maskPhone(p: string | null): string {
    if (!p) return '';
    const s = String(p);
    if (s.length < 7) return '****';
    return s.slice(0, 3) + '****' + s.slice(-4);
  }
}
