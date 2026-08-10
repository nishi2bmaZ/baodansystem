import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '请输入邮箱或手机号' })
  identifier: string; // 邮箱或商城手机号

  @IsString()
  @IsNotEmpty({ message: '请输入密码' })
  password: string;
}
