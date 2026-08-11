import { IsString, IsNotEmpty, MinLength } from 'class-validator';

/** 后台重置会员登录密码 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少 6 位' })
  password: string;
}
