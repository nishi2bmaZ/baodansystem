import { IsEmail, IsString, Matches, MinLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: '星际未来邮箱格式不正确' })
  email: string;

  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '商城手机号格式不正确' })
  phone: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  password: string;

  @IsOptional()
  @IsString()
  inviteCode?: string;
}
