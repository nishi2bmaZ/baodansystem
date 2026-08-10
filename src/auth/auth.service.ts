import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  /** 注册：邮箱+手机号双唯一，邀请码绑定上级，状态 PENDING 待审核（Q1/Q2/Q4） */
  async register(dto: RegisterDto) {
    const existEmail = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existEmail) throw new ConflictException('该星际未来邮箱已注册');
    const existPhone = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existPhone) throw new ConflictException('该商城手机号已注册');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    let referrer = null;
    let inviteCodeRecord = null;
    if (dto.inviteCode) {
      inviteCodeRecord = await this.prisma.inviteCode.findUnique({ where: { code: dto.inviteCode } });
      if (!inviteCodeRecord || inviteCodeRecord.status !== 'UNUSED') {
        throw new BadRequestException('邀请码无效或已被使用');
      }
      referrer = await this.prisma.user.findUnique({ where: { id: inviteCodeRecord.ownerId } });
    }

    const path = referrer ? `${referrer.path}${referrer.id}/` : '/';
    const depth = referrer ? referrer.depth + 1 : 0;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        status: 'PENDING',
        inviteCode: dto.inviteCode ?? null,
        referrerId: referrer ? referrer.id : null,
        path,
        depth,
      },
    });

    if (inviteCodeRecord) {
      await this.prisma.inviteCode.update({
        where: { id: inviteCodeRecord.id },
        data: { status: 'USED', usedById: user.id },
      });
    }

    // 给新用户生成自己的邀请码，便于他发展下级
    const myCode = await this.genCode();
    await this.prisma.inviteCode.create({
      data: { code: myCode, ownerId: user.id, status: 'UNUSED' },
    });

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      status: user.status,
      message: '注册成功，等待客服人工审核后可使用',
    };
  }

  private async genCode(): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 10; i++) {
      let c = '';
      for (let j = 0; j < 8; j++) c += chars[Math.floor(Math.random() * chars.length)];
      const exist = await this.prisma.inviteCode.findUnique({ where: { code: c } });
      if (!exist) return c;
    }
    return 'CODE' + Date.now();
  }

  /** 校验账号密码 + 状态（仅 ACTIVE 可登录） */
  async validateUser(identifier: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    });
    if (!user) throw new UnauthorizedException('账号或密码错误');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('账号或密码错误');
    if (user.status === 'PENDING') throw new UnauthorizedException('账号待审核，请联系客服');
    if (user.status === 'DISABLED') throw new UnauthorizedException('账号已被禁用');
    return user;
  }

  login(user: any) {
    const payload = { sub: user.id, email: user.email, phone: user.phone };
    return {
      token: this.jwt.sign(payload),
      user: { id: user.id, email: user.email, phone: user.phone, status: user.status },
    };
  }

  /** 客服人工审核通过（Q4） */
  async review(userId: number, operatorId = 0) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.status === 'ACTIVE') return { message: '已是激活状态' };
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', reviewedAt: new Date(), reviewedById: operatorId },
    });
    return { id: updated.id, status: updated.status, message: '审核通过，账号已激活' };
  }
}
