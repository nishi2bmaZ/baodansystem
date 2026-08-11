import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

/** 后台修改会员基本资料（姓名 / 手机号 / 等级），字段均可选 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  phone?: string;

  @IsOptional()
  @IsString()
  level?: string;
}
