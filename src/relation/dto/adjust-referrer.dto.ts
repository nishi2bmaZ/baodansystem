import { IsInt, IsOptional, IsString, IsNotEmpty } from 'class-validator';

/** 后台调整某用户的上级（推荐关系） */
export class AdjustReferrerDto {
  /** 要调整的用户 id */
  @IsInt()
  @IsNotEmpty()
  userId: number;

  /** 新的上级 id；不填则置为顶层（无上级） */
  @IsOptional()
  @IsInt()
  newReferrerId?: number;

  /** 调整原因（记录到日志，便于追溯，Q2 客服人工核对） */
  @IsOptional()
  @IsString()
  reason?: string;
}
