import {
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  IsIn,
} from 'class-validator';

export class FieldDefDto {
  @IsString()
  key: string;

  @IsString()
  label: string;

  @IsIn(['text', 'number', 'image', 'dropdown', 'date', 'checkbox'])
  type: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  options?: string[];

  @IsOptional()
  @IsString()
  placeholder?: string;
}

/** 单个参考操作步骤（如充值地址），copyable=true 时会员端提供一键复制；image 为可选参考图 */
export class StepDto {
  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsBoolean()
  copyable?: boolean;

  @IsOptional()
  @IsString()
  image?: string;
}

/** 任务的一个阶段：含标题、填报字段、参考步骤 */
export class StageDto {
  @IsString()
  title: string;

  @IsArray()
  fields: FieldDefDto[];

  @IsOptional()
  @IsArray()
  steps?: StepDto[];
}

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  stages: StageDto[];

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: string;
}
